/**
 * The automation editor's draft: every value as typed (strings), list items with stable keys, and
 * conversions to and from the service input. Field errors from the service use dotted paths into
 * the input (`triggers.0.every`); `errorsUnder` hands each item its own.
 */

import { CONDITION_OPS } from '../../../core/domain/automation.js';
import { toDecimalString } from '../../../core/domain/money.js';
import { isoWeekday, phaseFor, roundsUntil } from '../../../core/domain/repeatSchedule.js';

/** @typedef {import('../../../core/domain/automation.js').Automation} Automation */
/** @typedef {import('../../../core/domain/automation.js').AutomationInput} AutomationInput */
/** @typedef {import('../../../core/domain/automation.js').Condition} Condition */
/** @typedef {import('../../../core/domain/automation.js').TriggerInput} TriggerInput */
/** @typedef {import('../../../core/domain/repeatSchedule.js').RepeatUnit} RepeatUnit */
/** @typedef {import('../../components/TransactionFields.jsx').TransactionDraft} TransactionDraft */

/**
 * One "When". For a schedule, `firstRound` is which round comes first, counted from now ("this
 * week" = 0, "next week" = 1); it becomes the stored phase on save.
 * @typedef {object} TriggerDraft
 * @property {string} key
 * @property {'schedule' | 'transactionRecorded'} type
 * @property {string} every
 * @property {RepeatUnit} unit
 * @property {string} firstRound
 * @property {number[]} weekdays ISO 1 = Monday … 7 = Sunday
 * @property {'day' | 'weekday'} monthMode
 * @property {string} day day of the month (31 = last day) or of the year's month
 * @property {string} nth '1'…'4', or '-1' for "last"
 * @property {string} weekday ISO weekday for "the Nth weekday"
 * @property {string} month '1'…'12'
 * @property {string} weekend
 */

/**
 * One check; only the fields its `field` uses matter. The field never changes after it is added.
 * @typedef {object} ConditionDraft
 * @property {string} key
 * @property {string} field
 * @property {string} op
 * @property {string} accountId
 * @property {string} kind
 * @property {string} categoryId
 * @property {string} text
 * @property {string} amount
 * @property {string} currency
 */

/** @typedef {{ key: string, match: string, items: ConditionDraft[] }} GroupDraft */
/** @typedef {{ match: string, items: Array<ConditionDraft | GroupDraft> }} ConditionsDraft */

/**
 * One step. Create transaction uses the transaction fields; Set budget uses `budgetCategoryId`.
 * `amount` is the fixed amount or the percentage, as typed.
 * @typedef {TransactionDraft & {
 *   key: string,
 *   type: 'createTransaction' | 'setBudget',
 *   amountType: 'fixed' | 'percent',
 *   budgetCategoryId: string,
 *   currency: string,
 * }} ActionDraft
 */

/**
 * @typedef {object} AutomationDraft
 * @property {string} name
 * @property {string} startDate
 * @property {string} endDate
 * @property {TriggerDraft[]} triggers
 * @property {ConditionsDraft} conditions
 * @property {ActionDraft[]} actions
 */

/** @typedef {{ accountId: string, currency: string }} DraftDefaults */

/** @returns {string} a key for a new list item */
function newKey() {
  return globalThis.crypto.randomUUID();
}

/**
 * @param {ConditionDraft | GroupDraft} item
 * @returns {item is GroupDraft}
 */
export function isGroupDraft(item) {
  return 'items' in item;
}

/**
 * A new "When". A schedule starts monthly on today's day, with today's weekday and date ready
 * should the user switch to weeks or years.
 * @param {'schedule' | 'transactionRecorded'} type
 * @param {string} today
 * @returns {TriggerDraft}
 */
export function triggerDraft(type, today) {
  const weekday = isoWeekday(today);
  const day = Number(today.slice(8));
  return {
    key: newKey(),
    type,
    every: '1',
    unit: 'month',
    firstRound: '0',
    weekdays: [weekday],
    monthMode: 'day',
    day: String(day),
    nth: String(Math.min(4, Math.ceil(day / 7))),
    weekday: String(weekday),
    month: String(Number(today.slice(5, 7))),
    weekend: 'keep',
  };
}

/**
 * A new check on `field`, with its first comparison.
 * @param {string} field
 * @param {DraftDefaults} defaults
 * @returns {ConditionDraft}
 */
export function conditionDraft(field, defaults) {
  const ops = CONDITION_OPS[/** @type {keyof typeof CONDITION_OPS} */ (field)];
  return {
    key: newKey(),
    field,
    op: ops?.[0] ?? 'is',
    accountId: '',
    kind: 'income',
    categoryId: '',
    text: '',
    amount: '',
    currency: defaults.currency,
  };
}

/** @returns {GroupDraft} an empty group: its checks are added in its window */
export function groupDraft() {
  return { key: newKey(), match: 'any', items: [] };
}

/**
 * @param {'createTransaction' | 'setBudget'} type
 * @param {DraftDefaults} defaults
 * @returns {ActionDraft}
 */
export function actionDraft(type, defaults) {
  return {
    key: newKey(),
    type,
    amountType: 'fixed',
    amount: '',
    kind: 'expense',
    accountId: defaults.accountId,
    toAccountId: '',
    categoryId: '',
    date: '',
    payee: '',
    note: '',
    budgetCategoryId: '',
    currency: defaults.currency,
  };
}

/**
 * A new automation: empty When, If and Do, active from today. Coming from a budget ("Repeat every
 * month"), it starts with "every month on day 1" and the Set budget step for that budget.
 * @param {{ today: string, defaults: DraftDefaults, budget?: { categoryId: string, limit: string } }} options
 * @returns {AutomationDraft}
 */
export function newAutomationDraft({ today, defaults, budget }) {
  /** @type {AutomationDraft} */
  const draft = {
    name: '',
    startDate: today,
    endDate: '',
    triggers: [],
    conditions: { match: 'all', items: [] },
    actions: [],
  };
  if (!budget) return draft;
  return {
    ...draft,
    triggers: [{ ...triggerDraft('schedule', today), day: '1' }],
    actions: [
      {
        ...actionDraft('setBudget', defaults),
        budgetCategoryId: budget.categoryId,
        amount: budget.limit,
      },
    ],
  };
}

/**
 * @param {number} basisPoints
 * @returns {string} e.g. 1250 → "12.5"
 */
function percentText(basisPoints) {
  return String(basisPoints / 100);
}

/**
 * @param {Condition} condition
 * @param {string} defaultCurrency
 * @returns {ConditionDraft}
 */
function conditionToDraft(condition, defaultCurrency) {
  const draft = conditionDraft(condition.field, { accountId: '', currency: defaultCurrency });
  draft.op = condition.op;
  if (condition.field === 'account' || condition.field === 'toAccount') {
    draft.accountId = condition.accountId;
  } else if (condition.field === 'kind') {
    draft.kind = condition.kind;
  } else if (condition.field === 'category' && condition.op !== 'isEmpty') {
    draft.categoryId = condition.categoryId;
  } else if (condition.field === 'payee') {
    draft.text = condition.text;
  } else if (condition.field === 'amount') {
    draft.amount = toDecimalString(condition.amountMinor, condition.currency);
    draft.currency = condition.currency;
  }
  return draft;
}

/**
 * The draft for editing a saved automation.
 * @param {Automation} automation
 * @param {{ currencyOf: (accountId: string) => string, defaultCurrency: string, today: string }} context
 * @returns {AutomationDraft}
 */
export function automationToDraft(automation, { currencyOf, defaultCurrency, today }) {
  return {
    name: automation.name,
    startDate: automation.startDate,
    endDate: automation.endDate ?? '',
    triggers: automation.triggers.map((trigger) => {
      const base = triggerDraft(trigger.type, today);
      if (trigger.type !== 'schedule') return base;
      return {
        ...base,
        every: String(trigger.every),
        unit: trigger.unit,
        firstRound: String(roundsUntil(trigger.unit, trigger.every, trigger.phase, today)),
        weekend: trigger.weekend,
        ...(trigger.weekdays ? { weekdays: trigger.weekdays } : {}),
        ...(trigger.monthDay?.kind === 'day'
          ? { monthMode: /** @type {const} */ ('day'), day: String(trigger.monthDay.day) }
          : {}),
        ...(trigger.monthDay?.kind === 'weekday'
          ? {
              monthMode: /** @type {const} */ ('weekday'),
              nth: String(trigger.monthDay.nth),
              weekday: String(trigger.monthDay.weekday),
            }
          : {}),
        ...(trigger.unit === 'year'
          ? { month: String(trigger.month), day: String(trigger.day) }
          : {}),
      };
    }),
    conditions: automation.conditions
      ? {
          match: automation.conditions.match,
          items: automation.conditions.items.map((item) =>
            'items' in item
              ? {
                  key: newKey(),
                  match: item.match,
                  items: item.items.map((inner) => conditionToDraft(inner, defaultCurrency)),
                }
              : conditionToDraft(item, defaultCurrency),
          ),
        }
      : { match: 'all', items: [] },
    actions: automation.actions.map((action) => {
      if (action.type === 'setBudget') {
        return {
          ...actionDraft('setBudget', { accountId: '', currency: action.currency }),
          budgetCategoryId: action.categoryId,
          amountType: action.amount.type,
          amount:
            action.amount.type === 'fixed'
              ? toDecimalString(action.amount.amountMinor, action.currency)
              : percentText(action.amount.basisPoints),
        };
      }
      const { template, amount } = action;
      const currency = currencyOf(template.accountId);
      return {
        ...actionDraft('createTransaction', { accountId: template.accountId, currency }),
        kind: template.kind,
        toAccountId: template.toAccountId ?? '',
        categoryId: template.categoryId ?? '',
        payee: template.payee,
        note: template.note,
        amountType: amount.type,
        amount:
          amount.type === 'fixed'
            ? toDecimalString(amount.amountMinor, currency)
            : percentText(amount.basisPoints),
      };
    }),
  };
}

/**
 * The service input for one "When"; the first round becomes the phase counted from `today`.
 * @param {TriggerDraft} draft
 * @param {string} today
 * @returns {TriggerInput}
 */
export function triggerInput(draft, today) {
  if (draft.type === 'transactionRecorded') return { type: 'transactionRecorded' };
  const every = Number(draft.every);
  const firstRound = Number(draft.firstRound) || 0;
  const phase =
    Number.isInteger(every) && every >= 1
      ? phaseFor(draft.unit, every, firstRound % every, today)
      : 0;
  /** @type {TriggerInput} */
  const input = {
    type: 'schedule',
    every: draft.every,
    unit: draft.unit,
    phase,
    weekend: draft.weekend,
  };
  switch (draft.unit) {
    case 'week':
      return { ...input, weekdays: draft.weekdays };
    case 'month':
      return {
        ...input,
        monthDay:
          draft.monthMode === 'weekday'
            ? { kind: 'weekday', nth: draft.nth, weekday: draft.weekday }
            : { kind: 'day', day: draft.day },
      };
    case 'year':
      return { ...input, month: draft.month, day: draft.day };
    default:
      return input;
  }
}

/**
 * @param {ConditionDraft} draft
 * @returns {import('../../../core/domain/automation.js').ConditionInput}
 */
export function conditionInput(draft) {
  const { field, op } = draft;
  switch (field) {
    case 'account':
    case 'toAccount':
      return { field, op, accountId: draft.accountId };
    case 'kind':
      return { field, op, kind: draft.kind };
    case 'category':
      return op === 'isEmpty' ? { field, op } : { field, op, categoryId: draft.categoryId };
    case 'payee':
      return { field, op, text: draft.text };
    default:
      return { field, op, amount: draft.amount, currency: draft.currency };
  }
}

/**
 * @param {ActionDraft} action
 * @returns {import('../../../core/domain/automation.js').ActionInput}
 */
export function actionInput(action) {
  const amount = { type: action.amountType, value: action.amount };
  if (action.type === 'setBudget') {
    return { type: 'setBudget', categoryId: action.budgetCategoryId, amount };
  }
  const transfer = action.kind === 'transfer';
  return {
    type: 'createTransaction',
    template: {
      kind: action.kind,
      accountId: action.accountId,
      toAccountId: transfer ? action.toAccountId || null : null,
      categoryId: transfer ? null : action.categoryId || null,
      payee: action.payee,
      note: action.note,
    },
    amount,
  };
}

/**
 * Whether the draft has a "transaction is recorded" trigger (which the If checks need).
 * @param {AutomationDraft} draft
 * @returns {boolean}
 */
export function reactsToTransactions(draft) {
  return draft.triggers.some((t) => t.type === 'transactionRecorded');
}

/**
 * The service input for a draft. Checks only apply to "a transaction is recorded", so they are
 * left out when no such trigger remains.
 * @param {AutomationDraft} draft
 * @param {string} today
 * @returns {AutomationInput}
 */
export function toAutomationInput(draft, today) {
  return {
    name: draft.name,
    startDate: draft.startDate,
    endDate: draft.endDate || null,
    triggers: draft.triggers.map((trigger) => triggerInput(trigger, today)),
    conditions:
      reactsToTransactions(draft) && draft.conditions.items.length > 0
        ? {
            match: draft.conditions.match,
            items: draft.conditions.items.map((item) =>
              isGroupDraft(item)
                ? { match: item.match, items: item.items.map(conditionInput) }
                : conditionInput(item),
            ),
          }
        : null,
    actions: draft.actions.map(actionInput),
  };
}

/**
 * The errors whose path starts with `prefix`, with the prefix removed.
 * @param {Record<string, string>} errors
 * @param {string} prefix e.g. `actions.0.`
 * @returns {Record<string, string>}
 */
export function errorsUnder(errors, prefix) {
  /** @type {Record<string, string>} */
  const found = {};
  for (const [path, key] of Object.entries(errors)) {
    if (path.startsWith(prefix)) found[path.slice(prefix.length)] = key;
  }
  return found;
}

/**
 * A name to suggest from the first step, so the user rarely has to type one.
 * @param {AutomationDraft} draft
 * @param {(categoryId: string) => string | undefined} categoryName
 * @returns {string}
 */
export function suggestedName(draft, categoryName) {
  const first = draft.actions[0];
  if (!first) return '';
  if (first.type === 'setBudget') return categoryName(first.budgetCategoryId) ?? '';
  return first.payee.replace(/\{[A-Za-z]+\}/g, '').trim() || categoryName(first.categoryId) || '';
}
