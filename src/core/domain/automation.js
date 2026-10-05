/**
 * Automations: "When [trigger] → If [conditions] → Do [actions]" (docs/DECISIONS.md, D50–D53).
 *
 * An automation automates the user's own input: what it makes are ordinary transactions and
 * budgets that keep only an `automationId` (for the history list and the "Made by" note). Results
 * get predictable IDs so that two devices running the same automation produce one merged record:
 *
 * - schedule results: `<automationId>:t<trigger>:a<action>:<planned date>`
 * - results of a recorded transaction: `<automationId>:a<action>:<source transaction id>`
 * - Run now: `<automationId>:run:<random id>`
 * - budgets: the ordinary budget ID `<categoryId>:<YYYY-MM>`
 *
 * Everything here is pure: results are built only from the automation's rule fields, the trigger
 * date, and the recorded transaction, never from fields that can change later (name, end date,
 * settings), so every device builds identical records. Audit fields and clocks are added by the
 * repository when it writes the results.
 */

import { ValidationError } from '../errors.js';
import { budgetId } from './budget.js';
import {
  addDays,
  daysInMonth,
  dayOfWeek,
  isLocalDate,
  parseLocalDate,
  yearMonthOf,
} from './localDate.js';
import { isCurrencyCode, parseMoney, toDecimalString } from './money.js';
import { MAX_EVERY, NTH_VALUES, repeatDates, REPEAT_UNITS } from './repeatSchedule.js';
import { normalizeTransactionInput, TRANSACTION_KINDS } from './transaction.js';
import {
  checkRequiredText,
  cleanText,
  isOneOf,
  MAX_NAME_LENGTH,
  MAX_TEXT_LENGTH,
  throwIfInvalid,
} from './validation.js';

/** @typedef {import('./validation.js').BaseEntity} BaseEntity */
/** @typedef {import('./validation.js').EntityContext} EntityContext */
/** @typedef {import('./localDate.js').LocalDate} LocalDate */
/** @typedef {import('./repeatSchedule.js').RepeatSchedule} RepeatSchedule */
/** @typedef {import('./repeatSchedule.js').RepeatUnit} RepeatUnit */
/** @typedef {import('./repeatSchedule.js').Nth} Nth */
/** @typedef {import('./transaction.js').Transaction} Transaction */
/** @typedef {import('./transaction.js').TransactionKind} TransactionKind */
/** @typedef {import('./transaction.js').TransactionFields} TransactionFields */
/** @typedef {import('./budget.js').Budget} Budget */

export const MAX_TRIGGERS = 5;
export const MAX_ACTIONS = 5;
/** Items per condition group (top level or nested). */
export const MAX_GROUP_ITEMS = 10;
/** Maximum results written per automation in one run (catch-up cap). */
export const RUN_CAP = 366;
/** Basis points in 100%. */
export const FULL_PERCENT = 10_000;
/**
 * How far past today planned dates are looked at: a date planned for a Sunday and moved to the
 * Friday before is due two days early.
 */
export const WEEKEND_LOOKAHEAD_DAYS = 2;
/** Language of fill-in words, fixed so every device writes the same text (D51). */
export const FILL_IN_LOCALE = 'en';

export const TRIGGER_TYPES = /** @type {const} */ (['schedule', 'transactionRecorded']);
export const WEEKEND_RULES = /** @type {const} */ (['keep', 'before', 'after']);
export const ACTION_TYPES = /** @type {const} */ (['createTransaction', 'setBudget']);
export const AMOUNT_TYPES = /** @type {const} */ (['fixed', 'percent']);
export const MATCH_MODES = /** @type {const} */ (['all', 'any']);
export const CONDITION_FIELDS = /** @type {const} */ ([
  'account',
  'toAccount',
  'kind',
  'category',
  'payee',
  'amount',
]);
/** Operators allowed for each condition field; the first is the default. */
export const CONDITION_OPS = /** @type {const} */ ({
  account: ['is', 'isNot'],
  toAccount: ['is', 'isNot'],
  kind: ['is'],
  category: ['is', 'isNot', 'isEmpty'],
  payee: ['contains', 'is'],
  amount: ['atLeast', 'atMost'],
});

/**
 * Fill-in words for an action's payee and note. `fromSource` words come from the recorded
 * transaction and are empty for schedules and Run now.
 * @type {ReadonlyArray<{ word: string, fromSource: boolean }>}
 */
export const FILL_IN_WORDS = [
  { word: 'date', fromSource: false },
  { word: 'month', fromSource: false },
  { word: 'year', fromSource: false },
  { word: 'payee', fromSource: true },
  { word: 'amount', fromSource: true },
  { word: 'note', fromSource: true },
];

/** The fields whose clocks make up the rule clock (D51); an edit to any of them makes it newer. */
export const RULE_FIELDS = /** @type {const} */ ([
  'triggers',
  'conditions',
  'actions',
  'startDate',
]);

const WORD_PATTERN = /\{([A-Za-z]+)\}/g;

/** @typedef {(typeof WEEKEND_RULES)[number]} WeekendRule */
/** @typedef {(typeof MATCH_MODES)[number]} MatchMode */

/**
 * A calendar-style repeat (D54): every N days, weeks (on weekdays), months (on a day or the Nth
 * weekday), or years (on a date). `weekend` only applies to a day of the month and to years; it is
 * stored as `keep` otherwise.
 * @typedef {RepeatSchedule & { type: 'schedule', weekend: WeekendRule }} ScheduleTrigger
 */
/** @typedef {{ type: 'transactionRecorded' }} TransactionTrigger */
/** @typedef {ScheduleTrigger | TransactionTrigger} Trigger */

/**
 * One check on the recorded transaction. Amount checks only match transactions in their own
 * currency.
 * @typedef {{ field: 'account' | 'toAccount', op: 'is' | 'isNot', accountId: string }
 *   | { field: 'kind', op: 'is', kind: TransactionKind }
 *   | { field: 'category', op: 'is' | 'isNot', categoryId: string }
 *   | { field: 'category', op: 'isEmpty' }
 *   | { field: 'payee', op: 'is' | 'contains', text: string }
 *   | { field: 'amount', op: 'atLeast' | 'atMost', amountMinor: number, currency: string }} Condition
 */
/** @typedef {{ match: MatchMode, items: Condition[] }} ConditionSubgroup */
/** @typedef {{ match: MatchMode, items: Array<Condition | ConditionSubgroup> }} ConditionGroup */

/** @typedef {{ type: 'fixed', amountMinor: number } | { type: 'percent', basisPoints: number }} Amount */
/** @typedef {Omit<TransactionFields, 'date' | 'amountMinor'>} ActionTemplate */
/** @typedef {{ type: 'createTransaction', template: ActionTemplate, amount: Amount }} CreateTransactionAction */
/** @typedef {{ type: 'setBudget', categoryId: string, currency: string, amount: Amount }} SetBudgetAction */
/** @typedef {CreateTransactionAction | SetBudgetAction} Action */

/**
 * An automation. Every field can be edited in place (D52); an edit to the rule fields moves
 * `startDate` to today so nothing in the past is filled in. Results are made for trigger dates
 * from `startDate` through `endDate` (inclusive; null = no end).
 * @typedef {BaseEntity & {
 *   name: string,
 *   triggers: Trigger[],
 *   conditions: ConditionGroup | null,
 *   actions: Action[],
 *   startDate: LocalDate,
 *   endDate: LocalDate | null,
 * }} Automation
 */

/** @typedef {Pick<Automation, 'name' | 'triggers' | 'conditions' | 'actions' | 'startDate' | 'endDate'>} AutomationFields */

/** @typedef {{ type: string, value: string }} AmountInput */
/**
 * @typedef {object} TriggerInput
 * @property {string} type
 * @property {number | string} [every]
 * @property {string} [unit]
 * @property {number | string} [phase]
 * @property {Array<number | string>} [weekdays]
 * @property {{ kind: string, day?: number | string, nth?: number | string, weekday?: number | string }} [monthDay]
 * @property {number | string} [month]
 * @property {number | string} [day]
 * @property {string} [weekend]
 */
/**
 * @typedef {object} ConditionInput
 * @property {string} field
 * @property {string} op
 * @property {string} [accountId]
 * @property {string} [kind]
 * @property {string | null} [categoryId]
 * @property {string} [text]
 * @property {string} [amount] typed amount, for amount checks
 * @property {string} [currency] for amount checks
 */
/** @typedef {{ match: string, items: Array<ConditionInput | ConditionGroupInput> }} ConditionGroupInput */
/**
 * @typedef {object} ActionInput
 * @property {string} type
 * @property {{ kind: string, accountId: string, toAccountId?: string | null, categoryId?: string | null, payee?: string, note?: string }} [template]
 * @property {string} [categoryId] for setBudget
 * @property {AmountInput} amount
 */
/**
 * @typedef {object} AutomationInput
 * @property {string} name
 * @property {string} startDate
 * @property {string | null} [endDate]
 * @property {TriggerInput[]} triggers
 * @property {ConditionGroupInput | null} [conditions]
 * @property {ActionInput[]} actions
 */

/**
 * Facts about referenced entities, looked up by the service. `defaultCurrency` is the currency a
 * new Set budget step stores (D53); it is read once, when the automation is saved.
 * @typedef {object} AutomationRefs
 * @property {Map<string, { currency: string }>} accounts
 * @property {Map<string, { kind: 'income' | 'expense' }>} categories
 * @property {string} defaultCurrency
 */

// --- Validation -------------------------------------------------------------------------------

/**
 * Parses a typed percentage ("10", "12.5", "0,25") into basis points (1–10000).
 * @param {string} text
 * @returns {number | null}
 */
export function parsePercent(text) {
  const match = /^\s*(\d{1,3})(?:[.,](\d{1,2}))?\s*%?\s*$/.exec(String(text ?? ''));
  if (!match) return null;
  const basisPoints = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return basisPoints >= 1 && basisPoints <= FULL_PERCENT ? basisPoints : null;
}

/**
 * Fill-in words in `text` that don't exist.
 * @param {string} text
 * @returns {string[]}
 */
export function unknownWords(text) {
  const known = new Set(FILL_IN_WORDS.map((w) => w.word));
  return [...String(text ?? '').matchAll(WORD_PATTERN)]
    .map((match) => match[1])
    .filter((word) => !known.has(word));
}

/**
 * @param {Record<string, string | null>} errors
 * @param {string} prefix
 * @param {() => void} validate throws a ValidationError
 */
function collectPrefixed(errors, prefix, validate) {
  try {
    validate();
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
    for (const [field, key] of Object.entries(error.fields)) errors[`${prefix}${field}`] = key;
  }
}

/**
 * @param {TriggerInput} input
 * @param {string} path
 * @param {Record<string, string | null>} errors
 * @returns {Trigger}
 */
function normalizeTrigger(input, path, errors) {
  if (input.type === 'transactionRecorded') return { type: 'transactionRecorded' };
  if (input.type !== 'schedule') {
    errors[`${path}.type`] = 'validation.required';
    return { type: 'transactionRecorded' };
  }
  const every = Number(input.every);
  const unit = input.unit;
  const phase = Number(input.phase ?? 0);
  const everyOk = inRange(every, 1, MAX_EVERY);
  errors[`${path}.every`] = everyOk ? null : 'validation.every';
  errors[`${path}.unit`] = isOneOf(unit, REPEAT_UNITS) ? null : 'validation.required';
  errors[`${path}.phase`] = !everyOk || inRange(phase, 0, every - 1) ? null : 'validation.invalid';
  const weekend = input.weekend ?? 'keep';
  errors[`${path}.weekend`] = isOneOf(weekend, WEEKEND_RULES) ? null : 'validation.required';
  /** @type {ScheduleTrigger} */
  const trigger = {
    type: 'schedule',
    every,
    unit: /** @type {RepeatUnit} */ (unit),
    phase,
    weekend: /** @type {WeekendRule} */ (weekend),
  };
  if (unit === 'week') {
    const weekdays = [...new Set((input.weekdays ?? []).map(Number))].sort((x, y) => x - y);
    errors[`${path}.weekdays`] =
      weekdays.length === 0
        ? 'validation.weekdays'
        : weekdays.every((d) => inRange(d, 1, 7))
          ? null
          : 'validation.invalid';
    return { ...trigger, weekdays, weekend: 'keep' };
  }
  if (unit === 'month') {
    const monthDay = input.monthDay;
    if (monthDay?.kind === 'weekday') {
      const nth = Number(monthDay.nth);
      const weekday = Number(monthDay.weekday);
      errors[`${path}.nth`] = /** @type {readonly number[]} */ (NTH_VALUES).includes(nth)
        ? null
        : 'validation.required';
      errors[`${path}.weekday`] = inRange(weekday, 1, 7) ? null : 'validation.required';
      return {
        ...trigger,
        monthDay: { kind: 'weekday', nth: /** @type {Nth} */ (nth), weekday },
        weekend: 'keep',
      };
    }
    const day = Number(monthDay?.day);
    errors[`${path}.day`] = inRange(day, 1, 31) ? null : 'validation.dayOfMonth';
    return { ...trigger, monthDay: { kind: 'day', day } };
  }
  if (unit === 'year') {
    const month = Number(input.month);
    const day = Number(input.day);
    errors[`${path}.month`] = inRange(month, 1, 12) ? null : 'validation.required';
    errors[`${path}.day`] =
      inRange(month, 1, 12) && !inRange(day, 1, daysInMonth(2024, month))
        ? 'validation.dayOfMonth'
        : null;
    return { ...trigger, month, day };
  }
  return { ...trigger, weekend: 'keep' };
}

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {boolean} whether `value` is a whole number from `min` to `max`
 */
function inRange(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max;
}

/**
 * @param {ConditionInput} input
 * @param {string} path
 * @param {AutomationRefs} refs
 * @param {Record<string, string | null>} errors
 * @returns {Condition}
 */
function normalizeCondition(input, path, refs, errors) {
  const field = input.field;
  if (!isOneOf(field, CONDITION_FIELDS)) {
    errors[`${path}.field`] = 'validation.required';
    return { field: 'kind', op: 'is', kind: 'expense' };
  }
  /** @type {readonly string[]} */
  const ops = CONDITION_OPS[field];
  const op = input.op;
  if (!isOneOf(op, ops)) errors[`${path}.op`] = 'validation.required';
  switch (field) {
    case 'account':
    case 'toAccount': {
      const accountId = input.accountId ?? '';
      errors[`${path}.accountId`] = refs.accounts.has(accountId) ? null : 'validation.required';
      return { field, op: /** @type {'is' | 'isNot'} */ (op), accountId };
    }
    case 'kind': {
      errors[`${path}.kind`] = isOneOf(input.kind, TRANSACTION_KINDS)
        ? null
        : 'validation.required';
      return { field, op: 'is', kind: /** @type {TransactionKind} */ (input.kind) };
    }
    case 'category': {
      if (op === 'isEmpty') return { field, op };
      const categoryId = input.categoryId ?? '';
      errors[`${path}.categoryId`] = refs.categories.has(categoryId) ? null : 'validation.required';
      return { field, op: /** @type {'is' | 'isNot'} */ (op), categoryId };
    }
    case 'payee': {
      errors[`${path}.text`] = checkRequiredText(input.text, MAX_NAME_LENGTH);
      return { field, op: /** @type {'is' | 'contains'} */ (op), text: cleanText(input.text) };
    }
    case 'amount':
    default: {
      const currency = input.currency ?? refs.defaultCurrency;
      if (!isCurrencyCode(currency)) {
        errors[`${path}.currency`] = 'validation.required';
        return { field: 'amount', op: 'atLeast', amountMinor: 0, currency: refs.defaultCurrency };
      }
      const amount = parseMoney(input.amount ?? '', currency);
      errors[`${path}.amount`] = amount.ok ? null : `validation.money.${amount.error}`;
      return {
        field: 'amount',
        op: /** @type {'atLeast' | 'atMost'} */ (op),
        amountMinor: amount.ok ? amount.minor : 0,
        currency,
      };
    }
  }
}

/**
 * @param {ConditionGroupInput | null | undefined} input
 * @param {AutomationRefs} refs
 * @param {Record<string, string | null>} errors
 * @returns {ConditionGroup | null}
 */
function normalizeConditions(input, refs, errors) {
  if (!input || input.items.length === 0) return null;
  if (!isOneOf(input.match, MATCH_MODES)) errors['conditions.match'] = 'validation.required';
  if (input.items.length > MAX_GROUP_ITEMS) errors.conditions = 'validation.tooMany';
  /** @type {Array<Condition | ConditionSubgroup>} */
  const items = input.items.map((item, i) => {
    const path = `conditions.${i}`;
    if (!('items' in item)) return normalizeCondition(item, path, refs, errors);
    if (!isOneOf(item.match, MATCH_MODES)) errors[`${path}.match`] = 'validation.required';
    if (item.items.length === 0) errors[path] = 'validation.emptyGroup';
    if (item.items.length > MAX_GROUP_ITEMS) errors[path] = 'validation.tooMany';
    return {
      match: /** @type {MatchMode} */ (item.match),
      items: item.items.map((inner, j) => {
        if ('items' in inner) {
          // Groups nest one level deep only (D51); the form never offers more.
          errors[`${path}.${j}`] = 'validation.invalid';
          return /** @type {Condition} */ ({ field: 'kind', op: 'is', kind: 'expense' });
        }
        return normalizeCondition(inner, `${path}.${j}`, refs, errors);
      }),
    };
  });
  return { match: /** @type {MatchMode} */ (input.match), items };
}

/**
 * @param {AmountInput} input
 * @param {string} currency for fixed amounts
 * @param {{ allowZero: boolean }} options
 * @returns {{ amount: Amount, error: string | null }}
 */
function normalizeAmount(input, currency, { allowZero }) {
  if (input?.type === 'percent') {
    const basisPoints = parsePercent(input.value);
    return {
      amount: { type: 'percent', basisPoints: basisPoints ?? 0 },
      error: basisPoints === null ? 'validation.percent' : null,
    };
  }
  const money = parseMoney(input?.value ?? '', currency);
  const error = !money.ok
    ? `validation.money.${money.error}`
    : money.minor === 0 && !allowZero
      ? 'validation.money.zero'
      : null;
  return { amount: { type: 'fixed', amountMinor: money.ok ? money.minor : 0 }, error };
}

/**
 * @param {ActionInput} input
 * @param {string} path
 * @param {AutomationRefs} refs
 * @param {boolean} onlyEventTriggers whether a percentage (of the recorded transaction) is possible
 * @param {Record<string, string | null>} errors
 * @returns {Action}
 */
function normalizeAction(input, path, refs, onlyEventTriggers, errors) {
  /** @type {Action} */
  let action;
  if (input.type === 'setBudget') {
    const categoryId = input.categoryId ?? '';
    const category = refs.categories.get(categoryId);
    errors[`${path}.categoryId`] = !category
      ? 'validation.required'
      : category.kind !== 'expense'
        ? 'validation.categoryKind'
        : null;
    const { amount, error } = normalizeAmount(input.amount, refs.defaultCurrency, {
      allowZero: true,
    });
    errors[`${path}.amount`] = error;
    action = { type: 'setBudget', categoryId, currency: refs.defaultCurrency, amount };
  } else if (input.type === 'createTransaction' && input.template) {
    const template = input.template;
    /** @type {ActionTemplate} */
    let fields = {
      kind: 'expense',
      accountId: '',
      toAccountId: null,
      categoryId: null,
      payee: '',
      note: '',
    };
    collectPrefixed(errors, `${path}.`, () => {
      const normalized = normalizeTransactionInput(
        { ...template, amount: '', date: '' },
        {
          account: refs.accounts.get(template.accountId) ?? null,
          toAccount: template.toAccountId
            ? (refs.accounts.get(template.toAccountId) ?? null)
            : null,
          category: template.categoryId ? (refs.categories.get(template.categoryId) ?? null) : null,
        },
        { requireDate: false, requireAmount: false },
      );
      fields = {
        kind: normalized.kind,
        accountId: normalized.accountId,
        toAccountId: normalized.toAccountId,
        categoryId: normalized.categoryId,
        payee: normalized.payee,
        note: normalized.note,
      };
    });
    for (const key of /** @type {const} */ (['payee', 'note'])) {
      if (!errors[`${path}.${key}`] && unknownWords(template[key] ?? '').length > 0) {
        errors[`${path}.${key}`] = 'validation.unknownWord';
      }
    }
    const currency = refs.accounts.get(template.accountId)?.currency ?? refs.defaultCurrency;
    const { amount, error } = normalizeAmount(input.amount, currency, { allowZero: false });
    errors[`${path}.amount`] = error;
    action = { type: 'createTransaction', template: fields, amount };
  } else {
    errors[`${path}.type`] = 'validation.required';
    return {
      type: 'setBudget',
      categoryId: '',
      currency: refs.defaultCurrency,
      amount: { type: 'fixed', amountMinor: 0 },
    };
  }
  if (action.amount.type === 'percent' && !onlyEventTriggers && !errors[`${path}.amount`]) {
    errors[`${path}.amount`] = 'validation.percentNeedsEvent';
  }
  return action;
}

/**
 * Validates automation input and returns its fields. Field errors use dotted paths into the input
 * (`triggers.0.interval`, `conditions.1.0.text`, `actions.0.amount`).
 * @param {AutomationInput} input
 * @param {AutomationRefs} refs
 * @returns {AutomationFields}
 * @throws {ValidationError}
 */
export function normalizeAutomationInput(input, refs) {
  /** @type {Record<string, string | null>} */
  const errors = {};
  const triggers = (input.triggers ?? []).map((trigger, i) =>
    normalizeTrigger(trigger, `triggers.${i}`, errors),
  );
  const eventTriggers = triggers.filter((t) => t.type === 'transactionRecorded').length;
  errors.triggers =
    triggers.length === 0
      ? 'validation.required'
      : triggers.length > MAX_TRIGGERS
        ? 'validation.tooMany'
        : eventTriggers > 1
          ? 'validation.oneEventTrigger'
          : null;

  const conditions = normalizeConditions(input.conditions, refs, errors);
  if (conditions !== null && eventTriggers === 0)
    errors.conditions = 'validation.conditionsNeedEvent';

  const onlyEventTriggers = triggers.length > 0 && eventTriggers === triggers.length;
  const actions = (input.actions ?? []).map((action, i) =>
    normalizeAction(action, `actions.${i}`, refs, onlyEventTriggers, errors),
  );
  errors.actions =
    actions.length === 0
      ? 'validation.required'
      : actions.length > MAX_ACTIONS
        ? 'validation.tooMany'
        : null;

  const endDate = input.endDate ? input.endDate : null;
  errors.name = checkRequiredText(input.name, MAX_NAME_LENGTH);
  errors.startDate = isLocalDate(input.startDate) ? null : 'validation.date';
  errors.endDate =
    endDate === null
      ? null
      : !isLocalDate(endDate)
        ? 'validation.date'
        : isLocalDate(input.startDate) && endDate < input.startDate
          ? 'validation.endBeforeStart'
          : null;
  throwIfInvalid(errors);
  return {
    name: cleanText(input.name),
    triggers,
    conditions,
    actions,
    startDate: input.startDate,
    endDate,
  };
}

/**
 * @param {AutomationFields} fields validated fields
 * @param {EntityContext} ctx
 * @returns {Automation}
 */
export function createAutomation(fields, ctx) {
  return {
    id: ctx.id,
    ...structuredClone(fields),
    createdAt: ctx.now,
    updatedAt: ctx.now,
    deleted: false,
  };
}

/**
 * Whether two values of rule fields are the same (they are plain JSON).
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
export function sameValue(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// --- Questions about an automation ------------------------------------------------------------

/**
 * @param {Pick<Automation, 'triggers'>} automation
 * @returns {boolean}
 */
export function hasEventTrigger(automation) {
  return automation.triggers.some((t) => t.type === 'transactionRecorded');
}

/**
 * Run now needs no recorded transaction: every amount is fixed.
 * @param {Pick<Automation, 'actions'>} automation
 * @returns {boolean}
 */
export function canRunNow(automation) {
  return automation.actions.every((action) => action.amount.type === 'fixed');
}

/**
 * Whether the automation still acts on `today` or later.
 * @param {Pick<Automation, 'endDate'>} automation
 * @param {LocalDate} today
 * @returns {boolean}
 */
export function isRunning(automation, today) {
  return automation.endDate === null || automation.endDate >= today;
}

/**
 * Every account and category the automation uses, in conditions and actions. Accounts and
 * categories it uses can't be deleted (D53).
 * @param {Pick<Automation, 'conditions' | 'actions'>} automation
 * @returns {{ accountIds: Set<string>, categoryIds: Set<string> }}
 */
export function referencedIds(automation) {
  const accountIds = new Set(/** @type {string[]} */ ([]));
  const categoryIds = new Set(/** @type {string[]} */ ([]));
  for (const condition of flattenConditions(automation.conditions)) {
    if (condition.field === 'account' || condition.field === 'toAccount') {
      accountIds.add(condition.accountId);
    } else if (condition.field === 'category' && condition.op !== 'isEmpty') {
      categoryIds.add(condition.categoryId);
    }
  }
  for (const action of automation.actions) {
    if (action.type === 'setBudget') {
      categoryIds.add(action.categoryId);
      continue;
    }
    accountIds.add(action.template.accountId);
    if (action.template.toAccountId) accountIds.add(action.template.toAccountId);
    if (action.template.categoryId) categoryIds.add(action.template.categoryId);
  }
  return { accountIds, categoryIds };
}

/**
 * @param {ConditionGroup | null} group
 * @returns {Condition[]}
 */
function flattenConditions(group) {
  if (!group) return [];
  return group.items.flatMap((item) => ('items' in item ? item.items : [item]));
}

// --- Schedules --------------------------------------------------------------------------------

/**
 * Moves a date off the weekend: `before` to the Friday before, `after` to the Monday after.
 * @param {LocalDate} date
 * @param {WeekendRule} rule
 * @returns {LocalDate}
 */
export function shiftForWeekend(date, rule) {
  const day = dayOfWeek(date);
  if (rule === 'keep' || (day !== 0 && day !== 6)) return date;
  if (rule === 'before') return addDays(date, day === 6 ? -1 : -2);
  return addDays(date, day === 6 ? 2 : 1);
}

/**
 * Planned dates of a schedule within `[from, to]` (by planned date), each with the date it lands
 * on after the weekend rule.
 * @param {ScheduleTrigger} trigger
 * @param {LocalDate} from
 * @param {LocalDate} to
 * @param {number} [limit]
 * @returns {Array<{ planned: LocalDate, date: LocalDate }>}
 */
export function scheduleDates(trigger, from, to, limit = Infinity) {
  return repeatDates(trigger, from, to, limit).map((planned) => ({
    planned,
    date: shiftForWeekend(planned, trigger.weekend),
  }));
}

/**
 * The automation's schedule dates that land in `[from, to]`, within its start-to-end window
 * (by planned date), soonest first.
 * @param {Automation} automation
 * @param {LocalDate} from
 * @param {LocalDate} to
 * @returns {Array<{ triggerIndex: number, planned: LocalDate, date: LocalDate }>}
 */
export function landingDates(automation, from, to) {
  const lower =
    addDays(from, -WEEKEND_LOOKAHEAD_DAYS) > automation.startDate
      ? addDays(from, -WEEKEND_LOOKAHEAD_DAYS)
      : automation.startDate;
  const ahead = addDays(to, WEEKEND_LOOKAHEAD_DAYS);
  const upper =
    automation.endDate !== null && automation.endDate < ahead ? automation.endDate : ahead;
  /** @type {Array<{ triggerIndex: number, planned: LocalDate, date: LocalDate }>} */
  const dates = [];
  automation.triggers.forEach((trigger, triggerIndex) => {
    if (trigger.type !== 'schedule') return;
    for (const { planned, date } of scheduleDates(trigger, lower, upper)) {
      if (date >= from && date <= to) dates.push({ triggerIndex, planned, date });
    }
  });
  return dates.sort((a, b) =>
    a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.triggerIndex - b.triggerIndex,
  );
}

/**
 * The next date after `today` a schedule makes something, or null.
 * @param {Automation} automation
 * @param {LocalDate} today
 * @returns {LocalDate | null}
 */
export function nextDate(automation, today) {
  /** @type {LocalDate | null} */
  let next = null;
  // A date planned up to two days before tomorrow may land after today (moved to a Monday), but
  // nothing planned before the automation's start counts.
  const early = addDays(today, 1 - WEEKEND_LOOKAHEAD_DAYS);
  const lower = automation.startDate > early ? automation.startDate : early;
  for (const trigger of automation.triggers) {
    if (trigger.type !== 'schedule') continue;
    const upper = automation.endDate ?? '9999-12-31';
    // Look a few planned dates ahead: a shift may move one before another.
    for (const { date } of scheduleDates(trigger, lower, upper, 3 + WEEKEND_LOOKAHEAD_DAYS)) {
      if (date > today && (next === null || date < next)) next = date;
    }
  }
  return next;
}

// --- Conditions -------------------------------------------------------------------------------

/**
 * @param {Condition} condition
 * @param {Transaction} tx
 * @param {(accountId: string) => string | null} currencyOf
 * @returns {boolean}
 */
function matchesCondition(condition, tx, currencyOf) {
  switch (condition.field) {
    case 'account':
      return (tx.accountId === condition.accountId) === (condition.op === 'is');
    case 'toAccount':
      return (tx.toAccountId === condition.accountId) === (condition.op === 'is');
    case 'kind':
      return tx.kind === condition.kind;
    case 'category':
      if (condition.op === 'isEmpty') return tx.categoryId === null;
      return (tx.categoryId === condition.categoryId) === (condition.op === 'is');
    case 'payee': {
      // toLowerCase, not toLocaleLowerCase: devices with other locales must agree.
      const payee = tx.payee.trim().toLowerCase();
      const text = condition.text.toLowerCase();
      return condition.op === 'is' ? payee === text : payee.includes(text);
    }
    case 'amount':
      if (currencyOf(tx.accountId) !== condition.currency) return false;
      return condition.op === 'atLeast'
        ? tx.amountMinor >= condition.amountMinor
        : tx.amountMinor <= condition.amountMinor;
    default:
      return false;
  }
}

/**
 * @param {{ match: MatchMode, items: Array<Condition | ConditionSubgroup> }} group
 * @param {(item: Condition) => boolean} test
 * @returns {boolean}
 */
function matchesGroup(group, test) {
  /**
   * @param {Condition | ConditionSubgroup} item
   * @returns {boolean}
   */
  const check = (item) => ('items' in item ? matchesGroup(item, test) : test(item));
  return group.match === 'any'
    ? group.items.length === 0 || group.items.some(check)
    : group.items.every(check);
}

/**
 * Whether a transaction passes the automation's If checks (no checks: always).
 * @param {ConditionGroup | null} conditions
 * @param {Transaction} tx
 * @param {(accountId: string) => string | null} currencyOf
 * @returns {boolean}
 */
export function matches(conditions, tx, currencyOf) {
  if (conditions === null) return true;
  return matchesGroup(conditions, (condition) => matchesCondition(condition, tx, currencyOf));
}

/**
 * Whether a transaction can set off "a transaction is recorded" at all: transactions made by
 * automations (or by recurring rules of older app versions) and balance adjustments never do, so
 * automations can't set each other off in a loop.
 * @param {Transaction} tx
 * @returns {boolean}
 */
export function canTrigger(tx) {
  return !tx.automationId && !tx.recurringRuleId && tx.adjustment !== true;
}

// --- Amounts and fill-in words ----------------------------------------------------------------

/**
 * The amount an action uses: fixed, or a percentage of the recorded transaction rounded to the
 * nearest minor unit (half up), in integer arithmetic. Null when a percentage has no source.
 * @param {Amount} amount
 * @param {{ amountMinor: number } | null} source
 * @returns {number | null}
 */
export function resolveAmount(amount, source) {
  if (amount.type === 'fixed') return amount.amountMinor;
  if (!source) return null;
  const scaled = BigInt(source.amountMinor) * BigInt(amount.basisPoints);
  const minor = Number((scaled + BigInt(FULL_PERCENT / 2)) / BigInt(FULL_PERCENT));
  return Number.isSafeInteger(minor) ? minor : null;
}

/**
 * @typedef {object} FillContext
 * @property {LocalDate} date the trigger date (planned date for schedules)
 * @property {Transaction | null} source the recorded transaction, if any
 * @property {string | null} sourceCurrency
 */

/**
 * Replaces fill-in words. Unknown words stay as typed (validation rejects them on save).
 * @param {string} text
 * @param {FillContext} ctx
 * @param {number} maxLength
 * @returns {string}
 */
export function fillWords(text, ctx, maxLength) {
  const { year, month } = parseLocalDate(ctx.date);
  /** @type {Record<string, () => string>} */
  const values = {
    date: () => ctx.date,
    month: () =>
      new Intl.DateTimeFormat(FILL_IN_LOCALE, { month: 'long', timeZone: 'UTC' }).format(
        Date.UTC(year, month - 1, 1),
      ),
    year: () => String(year),
    payee: () => ctx.source?.payee ?? '',
    note: () => ctx.source?.note ?? '',
    amount: () =>
      ctx.source && ctx.sourceCurrency
        ? `${toDecimalString(ctx.source.amountMinor, ctx.sourceCurrency)} ${ctx.sourceCurrency}`
        : '',
  };
  const filled = text.replace(WORD_PATTERN, (whole, word) =>
    Object.hasOwn(values, word) ? values[word]() : whole,
  );
  return filled.trim().slice(0, maxLength).trim();
}

// --- Results ----------------------------------------------------------------------------------

/**
 * A record an automation makes, without audit fields: the repository adds `createdAt` and
 * `updatedAt` from the clock it writes with. `sourceId` is the recorded transaction, if any.
 * @typedef {{ entity: 'transactions', record: Omit<Transaction, 'createdAt' | 'updatedAt'>, sourceId: string | null }
 *   | { entity: 'budgets', record: Omit<Budget, 'createdAt' | 'updatedAt'>, sourceId: string | null }} AutomationResult
 */

/**
 * @param {string} automationId
 * @param {number} triggerIndex
 * @param {number} actionIndex
 * @param {LocalDate} planned
 * @returns {string}
 */
export function scheduledResultId(automationId, triggerIndex, actionIndex, planned) {
  return `${automationId}:t${triggerIndex}:a${actionIndex}:${planned}`;
}

/**
 * @param {string} automationId
 * @param {number} actionIndex
 * @param {string} sourceId
 * @returns {string}
 */
export function eventResultId(automationId, actionIndex, sourceId) {
  return `${automationId}:a${actionIndex}:${sourceId}`;
}

/**
 * @param {string} automationId
 * @param {string} randomId
 * @returns {string}
 */
export function runNowResultId(automationId, randomId) {
  return `${automationId}:run:${randomId}`;
}

/**
 * The ID prefix shared by every transaction an automation made.
 * @param {string} automationId
 * @returns {string}
 */
export function resultPrefix(automationId) {
  return `${automationId}:`;
}

/**
 * @typedef {object} BuildContext
 * @property {string} id the result's ID (transactions)
 * @property {LocalDate} date the date the result is dated
 * @property {LocalDate} wordDate the date fill-in words use (the planned date)
 * @property {Transaction | null} source
 * @property {(accountId: string) => string | null} currencyOf
 */

/**
 * Builds one action's result, or null when it can't be made (a percentage in another currency,
 * an amount that rounds to 0, an account that hasn't synced yet).
 * @param {Automation} automation
 * @param {Action} action
 * @param {BuildContext} ctx
 * @returns {AutomationResult | null}
 */
function buildResult(automation, action, ctx) {
  const sourceCurrency = ctx.source ? ctx.currencyOf(ctx.source.accountId) : null;
  if (ctx.source && sourceCurrency === null) return null;
  const sourceId = ctx.source?.id ?? null;
  if (action.type === 'setBudget') {
    if (action.amount.type === 'percent' && sourceCurrency !== action.currency) return null;
    const limitMinor = resolveAmount(action.amount, ctx.source);
    if (limitMinor === null) return null;
    const month = yearMonthOf(ctx.wordDate);
    return {
      entity: 'budgets',
      sourceId,
      record: {
        id: budgetId(action.categoryId, month),
        categoryId: action.categoryId,
        month,
        limitMinor,
        currency: action.currency,
        automationId: automation.id,
        recurring: false,
        deleted: false,
      },
    };
  }
  const targetCurrency = ctx.currencyOf(action.template.accountId);
  if (
    action.amount.type === 'percent' &&
    (targetCurrency === null || targetCurrency !== sourceCurrency)
  ) {
    return null;
  }
  const amountMinor = resolveAmount(action.amount, ctx.source);
  if (amountMinor === null || amountMinor <= 0) return null;
  const fill = { date: ctx.wordDate, source: ctx.source, sourceCurrency };
  return {
    entity: 'transactions',
    sourceId,
    record: {
      id: ctx.id,
      ...action.template,
      payee: fillWords(action.template.payee, fill, MAX_NAME_LENGTH),
      note: fillWords(action.template.note, fill, MAX_TEXT_LENGTH),
      date: ctx.date,
      amountMinor,
      automationId: automation.id,
      deleted: false,
    },
  };
}

/**
 * @typedef {object} RunContext
 * @property {LocalDate} today
 * @property {Set<string>} existingIds transaction IDs under the automation's prefix, in any state
 * @property {Set<string>} existingBudgetIds every budget ID, in any state
 * @property {(accountId: string) => string | null} currencyOf null when the account is unknown here
 * @property {number} [cap] maximum results (default RUN_CAP)
 */

/**
 * @param {AutomationResult} result
 * @param {RunContext} ctx
 * @param {Set<string>} taken IDs already returned in this build
 * @returns {boolean} whether the result is new
 */
function isNewResult(result, ctx, taken) {
  const id = result.record.id;
  if (taken.has(id)) return false;
  const existing = result.entity === 'budgets' ? ctx.existingBudgetIds : ctx.existingIds;
  if (existing.has(id)) return false;
  taken.add(id);
  return true;
}

/**
 * Results due from the automation's schedules: planned dates from its start through its end (or a
 * little past today, for the weekend rule) whose landing date is today or earlier, minus what
 * already exists.
 * @param {Automation} automation
 * @param {RunContext} ctx
 * @returns {AutomationResult[]}
 */
export function buildScheduledResults(automation, ctx) {
  const cap = ctx.cap ?? RUN_CAP;
  /** @type {AutomationResult[]} */
  const results = [];
  const taken = new Set(/** @type {string[]} */ ([]));
  const ahead = addDays(ctx.today, WEEKEND_LOOKAHEAD_DAYS);
  const upper =
    automation.endDate !== null && automation.endDate < ahead ? automation.endDate : ahead;
  for (const [triggerIndex, trigger] of automation.triggers.entries()) {
    if (trigger.type !== 'schedule') continue;
    for (const { planned, date } of scheduleDates(trigger, automation.startDate, upper)) {
      if (date > ctx.today) continue;
      for (const [actionIndex, action] of automation.actions.entries()) {
        const result = buildResult(automation, action, {
          id: scheduledResultId(automation.id, triggerIndex, actionIndex, planned),
          date,
          wordDate: planned,
          source: null,
          currencyOf: ctx.currencyOf,
        });
        if (result && isNewResult(result, ctx, taken)) results.push(result);
        if (results.length >= cap) return results;
      }
    }
  }
  return results;
}

/**
 * Results due from "a transaction is recorded": every transaction dated within the automation's
 * window (and not after today) that can trigger, passes the If checks, and has no result yet.
 * @param {Automation} automation
 * @param {Transaction[]} transactions candidates, any order
 * @param {RunContext} ctx
 * @returns {AutomationResult[]}
 */
export function buildEventResults(automation, transactions, ctx) {
  if (!hasEventTrigger(automation)) return [];
  const cap = ctx.cap ?? RUN_CAP;
  const last =
    automation.endDate !== null && automation.endDate < ctx.today ? automation.endDate : ctx.today;
  const sources = transactions
    .filter((tx) => tx.date >= automation.startDate && tx.date <= last)
    .filter((tx) => canTrigger(tx) && matches(automation.conditions, tx, ctx.currencyOf))
    .sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.id < b.id ? -1 : 1));
  /** @type {AutomationResult[]} */
  const results = [];
  const taken = new Set(/** @type {string[]} */ ([]));
  for (const source of sources) {
    for (const [actionIndex, action] of automation.actions.entries()) {
      const result = buildResult(automation, action, {
        id: eventResultId(automation.id, actionIndex, source.id),
        date: source.date,
        wordDate: source.date,
        source,
        currencyOf: ctx.currencyOf,
      });
      if (result && isNewResult(result, ctx, taken)) results.push(result);
      if (results.length >= cap) return results;
    }
  }
  return results;
}

/**
 * What Run now makes today: every action, with fresh IDs (Run now is a normal user action).
 * @param {Automation} automation
 * @param {LocalDate} today
 * @param {() => string} newId
 * @param {(accountId: string) => string | null} currencyOf
 * @returns {AutomationResult[]}
 */
export function buildRunNowResults(automation, today, newId, currencyOf) {
  return automation.actions
    .map((action) =>
      buildResult(automation, action, {
        id: runNowResultId(automation.id, newId()),
        date: today,
        wordDate: today,
        source: null,
        currencyOf,
      }),
    )
    .filter((result) => result !== null);
}

/**
 * What would happen if the recorded transaction `source` set the automation off now (for the
 * preview). Ignores the date window and existing results.
 * @param {Automation} automation
 * @param {Transaction} source
 * @param {(accountId: string) => string | null} currencyOf
 * @returns {AutomationResult[]}
 */
export function previewEventResults(automation, source, currencyOf) {
  return automation.actions
    .map((action, actionIndex) =>
      buildResult(automation, action, {
        id: eventResultId(automation.id, actionIndex, source.id),
        date: source.date,
        wordDate: source.date,
        source,
        currencyOf,
      }),
    )
    .filter((result) => result !== null);
}

/**
 * What a schedule would make on one landing date (for the preview and the upcoming list).
 * @param {Automation} automation
 * @param {{ triggerIndex: number, planned: LocalDate, date: LocalDate }} landing
 * @param {(accountId: string) => string | null} currencyOf
 * @returns {Array<AutomationResult & { actionIndex: number }>}
 */
export function previewScheduledResults(automation, landing, currencyOf) {
  /** @type {Array<AutomationResult & { actionIndex: number }>} */
  const results = [];
  automation.actions.forEach((action, actionIndex) => {
    const result = buildResult(automation, action, {
      id: scheduledResultId(automation.id, landing.triggerIndex, actionIndex, landing.planned),
      date: landing.date,
      wordDate: landing.planned,
      source: null,
      currencyOf,
    });
    if (result) results.push({ ...result, actionIndex });
  });
  return results;
}
