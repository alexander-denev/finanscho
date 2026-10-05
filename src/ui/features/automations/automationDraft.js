/**
 * The automation form's draft: every value as typed (strings), list items with stable keys, and
 * conversions to and from the service input. Field errors from the service use dotted paths into
 * the input (`triggers.0.interval`); `errorsUnder` hands each row its own.
 */

import { toDecimalString } from '../../../core/domain/money.js';

/** @typedef {import('../../../core/domain/automation.js').Automation} Automation */
/** @typedef {import('../../../core/domain/automation.js').AutomationInput} AutomationInput */
/** @typedef {import('../../../core/domain/automation.js').Condition} Condition */
/** @typedef {import('../../components/TransactionFields.jsx').TransactionDraft} TransactionDraft */

/**
 * @typedef {object} TriggerDraft
 * @property {string} key
 * @property {'schedule' | 'transactionRecorded'} type
 * @property {string} frequency
 * @property {string} interval
 * @property {string} firstDate
 * @property {boolean} lastDayOfMonth
 * @property {string} weekend
 */

/**
 * One check; only the fields its `field` uses matter.
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
 * @param {'schedule' | 'transactionRecorded'} type
 * @param {string} today
 * @returns {TriggerDraft}
 */
export function triggerDraft(type, today) {
  return {
    key: newKey(),
    type,
    frequency: 'monthly',
    interval: '1',
    firstDate: today,
    lastDayOfMonth: false,
    weekend: 'keep',
  };
}

/**
 * @param {{ accountId: string, currency: string }} defaults
 * @returns {ConditionDraft}
 */
export function conditionDraft(defaults) {
  return {
    key: newKey(),
    field: 'kind',
    op: 'is',
    accountId: defaults.accountId,
    kind: 'income',
    categoryId: '',
    text: '',
    amount: '',
    currency: defaults.currency,
  };
}

/**
 * A new group starts with one check, so it never stands empty.
 * @param {{ accountId: string, currency: string }} defaults
 * @returns {GroupDraft}
 */
export function groupDraft(defaults) {
  return { key: newKey(), match: 'any', items: [conditionDraft(defaults)] };
}

/**
 * @param {'createTransaction' | 'setBudget'} type
 * @param {{ accountId: string, currency: string }} defaults
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
 * A new automation: a monthly schedule from today and one Create transaction step, or, coming
 * from a budget ("Repeat every month"), a monthly Set budget step from this month's first day.
 * @param {{ today: string, accountId: string, currency: string, budget?: { categoryId: string, limit: string } }} options
 * @returns {AutomationDraft}
 */
export function newAutomationDraft({ today, accountId, currency, budget }) {
  const defaults = { accountId, currency };
  if (budget) {
    const firstOfMonth = `${today.slice(0, 7)}-01`;
    return {
      name: '',
      startDate: today,
      endDate: '',
      triggers: [{ ...triggerDraft('schedule', firstOfMonth) }],
      conditions: { match: 'all', items: [] },
      actions: [
        {
          ...actionDraft('setBudget', defaults),
          budgetCategoryId: budget.categoryId,
          amount: budget.limit,
        },
      ],
    };
  }
  return {
    name: '',
    startDate: today,
    endDate: '',
    triggers: [triggerDraft('schedule', today)],
    conditions: { match: 'all', items: [] },
    actions: [actionDraft('createTransaction', defaults)],
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
  const draft = conditionDraft({ accountId: '', currency: defaultCurrency });
  draft.field = condition.field;
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
 * @param {(accountId: string) => string} currencyOf
 * @param {string} defaultCurrency
 * @returns {AutomationDraft}
 */
export function automationToDraft(automation, currencyOf, defaultCurrency) {
  return {
    name: automation.name,
    startDate: automation.startDate,
    endDate: automation.endDate ?? '',
    triggers: automation.triggers.map((trigger) =>
      trigger.type === 'schedule'
        ? {
            key: newKey(),
            type: 'schedule',
            frequency: trigger.frequency,
            interval: String(trigger.interval),
            firstDate: trigger.firstDate,
            lastDayOfMonth: trigger.lastDayOfMonth,
            weekend: trigger.weekend,
          }
        : { ...triggerDraft('transactionRecorded', automation.startDate) },
    ),
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
 * @param {ConditionDraft} draft
 * @returns {import('../../../core/domain/automation.js').ConditionInput}
 */
function conditionInput(draft) {
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
 * The service input for a draft. Checks only apply to "a transaction is recorded", so they are
 * left out when no such trigger remains.
 * @param {AutomationDraft} draft
 * @returns {AutomationInput}
 */
export function toAutomationInput(draft) {
  const reacts = draft.triggers.some((t) => t.type === 'transactionRecorded');
  return {
    name: draft.name,
    startDate: draft.startDate,
    endDate: draft.endDate || null,
    triggers: draft.triggers.map((trigger) =>
      trigger.type === 'schedule'
        ? {
            type: 'schedule',
            frequency: trigger.frequency,
            interval: trigger.interval,
            firstDate: trigger.firstDate,
            lastDayOfMonth: trigger.lastDayOfMonth,
            weekend: trigger.weekend,
          }
        : { type: 'transactionRecorded' },
    ),
    conditions:
      reacts && draft.conditions.items.length > 0
        ? {
            match: draft.conditions.match,
            items: draft.conditions.items.map((item) =>
              isGroupDraft(item)
                ? { match: item.match, items: item.items.map(conditionInput) }
                : conditionInput(item),
            ),
          }
        : null,
    actions: draft.actions.map((action) => {
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
    }),
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
