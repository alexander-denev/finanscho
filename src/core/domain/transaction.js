import { isLocalDate } from './localDate.js';
import { parseMoney } from './money.js';
import {
  checkOptionalText,
  cleanText,
  isOneOf,
  MAX_NAME_LENGTH,
  throwIfInvalid,
} from './validation.js';

/** @typedef {import('./validation.js').BaseEntity} BaseEntity */
/** @typedef {import('./validation.js').EntityContext} EntityContext */
/** @typedef {import('./localDate.js').LocalDate} LocalDate */

export const TRANSACTION_KINDS = /** @type {const} */ (['expense', 'income', 'transfer']);

/** @typedef {(typeof TRANSACTION_KINDS)[number]} TransactionKind */

/**
 * A transaction. `amountMinor` is always positive; its sign is derived from `kind`.
 * Transfers move money from `accountId` to `toAccountId` and have no category. Income and
 * expenses may be uncategorized (`categoryId` null) until the user assigns one. `adjustment` marks
 * a balance adjustment recorded by reconciling an account (absent on other transactions): it
 * counts in balances but not in month income or spending. `automationId` names the automation that
 * made the transaction (null for the user's own); it only feeds the automation's history and the
 * "Made by" note. `recurringRuleId` is the same marker written by app versions before automations
 * (D50): kept on old records, never written any more.
 * @typedef {BaseEntity & {
 *   kind: TransactionKind,
 *   date: LocalDate,
 *   amountMinor: number,
 *   accountId: string,
 *   toAccountId: string | null,
 *   categoryId: string | null,
 *   payee: string,
 *   note: string,
 *   automationId?: string | null,
 *   recurringRuleId?: string | null,
 *   adjustment?: boolean,
 * }} Transaction
 */

/**
 * Whether an automation (or a recurring rule of an older app version) made the transaction.
 * @param {Pick<Transaction, 'automationId' | 'recurringRuleId'>} tx
 * @returns {boolean}
 */
export function isAutomatic(tx) {
  return Boolean(tx.automationId || tx.recurringRuleId);
}

/**
 * The editable fields of a transaction, also used as an automation's transaction template.
 * @typedef {object} TransactionFields
 * @property {TransactionKind} kind
 * @property {LocalDate} date
 * @property {number} amountMinor
 * @property {string} accountId
 * @property {string | null} toAccountId
 * @property {string | null} categoryId
 * @property {string} payee
 * @property {string} note
 */

/**
 * User input for a transaction. `amount` is the typed string.
 * @typedef {object} TransactionInput
 * @property {string} kind
 * @property {string} date
 * @property {string} amount
 * @property {string} accountId
 * @property {string | null} [toAccountId]
 * @property {string | null} [categoryId]
 * @property {string} [payee]
 * @property {string} [note]
 */

/**
 * Facts about referenced entities, looked up by the service, needed for validation.
 * @typedef {object} TransactionRefs
 * @property {{ currency: string } | null} account
 * @property {{ currency: string } | null} toAccount
 * @property {{ kind: 'income' | 'expense' } | null} category
 */

/**
 * Validates transaction input against the referenced entities. `date` and `amount` validation can
 * be skipped for automation templates, whose date comes from the trigger and whose amount is
 * validated separately (it may be a percentage); a skipped amount is returned as 0.
 * @param {TransactionInput} input
 * @param {TransactionRefs} refs
 * @param {{ requireDate?: boolean, requireAmount?: boolean }} [options]
 * @returns {Omit<TransactionFields, 'date'> & { date: string }}
 * @throws {import('../errors.js').ValidationError}
 */
export function normalizeTransactionInput(input, refs, options = {}) {
  const requireDate = options.requireDate ?? true;
  const requireAmount = options.requireAmount ?? true;
  const kind = input.kind;
  const isTransfer = kind === 'transfer';
  const currency = refs.account?.currency ?? 'EUR';
  const amount = parseMoney(input.amount, currency);

  /** @type {string | null} */
  let categoryError = null;
  // The category is optional (it can be assigned later), but a given one must exist and match.
  if (!isTransfer && input.categoryId) {
    if (refs.category === null) categoryError = 'validation.required';
    else if (refs.category.kind !== kind) categoryError = 'validation.categoryKind';
  }

  /** @type {string | null} */
  let toAccountError = null;
  if (isTransfer) {
    if (!input.toAccountId || refs.toAccount === null) toAccountError = 'validation.required';
    else if (input.toAccountId === input.accountId) toAccountError = 'validation.sameAccount';
    else if (refs.account && refs.toAccount.currency !== refs.account.currency) {
      toAccountError = 'validation.currencyMismatch';
    }
  }

  throwIfInvalid({
    kind: isOneOf(kind, TRANSACTION_KINDS) ? null : 'validation.required',
    date: !requireDate || isLocalDate(input.date) ? null : 'validation.date',
    amount: !requireAmount
      ? null
      : !amount.ok
        ? `validation.money.${amount.error}`
        : amount.minor === 0
          ? 'validation.money.zero'
          : null,
    accountId: input.accountId && refs.account !== null ? null : 'validation.required',
    toAccountId: toAccountError,
    categoryId: categoryError,
    payee: checkOptionalText(input.payee, MAX_NAME_LENGTH),
    note: checkOptionalText(input.note),
  });

  return {
    kind: /** @type {TransactionKind} */ (kind),
    date: requireDate ? input.date : '',
    amountMinor: requireAmount && amount.ok ? amount.minor : 0,
    accountId: input.accountId,
    toAccountId: isTransfer ? (input.toAccountId ?? null) : null,
    categoryId: isTransfer ? null : input.categoryId || null,
    payee: cleanText(input.payee),
    note: cleanText(input.note),
  };
}

/**
 * @param {TransactionFields} fields validated fields
 * @param {EntityContext} ctx
 * @param {string | null} [automationId]
 * @returns {Transaction}
 */
export function createTransaction(fields, ctx, automationId = null) {
  return {
    id: ctx.id,
    ...fields,
    automationId,
    createdAt: ctx.now,
    updatedAt: ctx.now,
    deleted: false,
  };
}

/**
 * Builds the balance adjustment that reconciles an account with the balance the user counted: an
 * uncategorized income or expense for the difference. The counted balance may be negative (card
 * debt). Returns null when the balances already match.
 * @param {{ accountId: string, currency: string, bookMinor: number, actual: string, date: LocalDate }} input
 *   `bookMinor` is the computed balance on `date`; `actual` is the counted balance as typed
 * @param {EntityContext} ctx
 * @returns {Transaction | null}
 * @throws {import('../errors.js').ValidationError}
 */
export function createBalanceAdjustment(input, ctx) {
  const actual = parseMoney(input.actual, input.currency, { allowNegative: true });
  throwIfInvalid({ balance: actual.ok ? null : `validation.money.${actual.error}` });
  const differenceMinor = (actual.ok ? actual.minor : 0) - input.bookMinor;
  throwIfInvalid({
    balance: Number.isSafeInteger(differenceMinor) ? null : 'validation.money.tooLarge',
  });
  if (differenceMinor === 0) return null;
  const transaction = createTransaction(
    {
      kind: differenceMinor > 0 ? 'income' : 'expense',
      date: input.date,
      amountMinor: Math.abs(differenceMinor),
      accountId: input.accountId,
      toAccountId: null,
      categoryId: null,
      payee: '',
      note: '',
    },
    ctx,
  );
  return { ...transaction, adjustment: true };
}

/**
 * Signed effect of a transaction on one account's balance, in minor units.
 * @param {Pick<Transaction, 'kind' | 'amountMinor' | 'accountId' | 'toAccountId'>} tx
 * @param {string} accountId
 * @returns {number}
 */
export function balanceEffect(tx, accountId) {
  if (tx.kind === 'income') return tx.accountId === accountId ? tx.amountMinor : 0;
  if (tx.kind === 'expense') return tx.accountId === accountId ? -tx.amountMinor : 0;
  let effect = 0;
  if (tx.accountId === accountId) effect -= tx.amountMinor;
  if (tx.toAccountId === accountId) effect += tx.amountMinor;
  return effect;
}

/**
 * Sort comparator: newest date first, then newest creation first, then id for stability.
 * @param {Transaction} a
 * @param {Transaction} b
 * @returns {number}
 */
export function compareTransactionsNewestFirst(a, b) {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}
