/**
 * To pays: payments the user still has to make by hand (docs/DECISIONS.md, D58). A To pay holds
 * the transaction it will record, minus the date, plus an optional due date. It has no status:
 * paying it records the transaction (dated the day it is paid) and deletes the To pay.
 */

import { ValidationError } from '../errors.js';
import { daysBetween, isLocalDate } from './localDate.js';
import { normalizeTransactionInput } from './transaction.js';
import { throwIfInvalid } from './validation.js';

/** @typedef {import('./validation.js').BaseEntity} BaseEntity */
/** @typedef {import('./validation.js').EntityContext} EntityContext */
/** @typedef {import('./localDate.js').LocalDate} LocalDate */
/** @typedef {import('./transaction.js').Transaction} Transaction */
/** @typedef {import('./transaction.js').TransactionFields} TransactionFields */
/** @typedef {import('./transaction.js').TransactionInput} TransactionInput */
/** @typedef {import('./transaction.js').TransactionRefs} TransactionRefs */

/**
 * A To pay. `automationId` names the automation that made it (null for the user's own); it only
 * feeds the "Automatic" badge and the "Made by" note, and edits never change it.
 * @typedef {BaseEntity & Omit<TransactionFields, 'date'> & {
 *   dueDate: LocalDate | null,
 *   automationId: string | null,
 * }} ToPay
 */

/** @typedef {Omit<TransactionFields, 'date'> & { dueDate: LocalDate | null }} ToPayFields */

/**
 * User input for a To pay. `amount` is the typed string; an empty `dueDate` means none.
 * @typedef {Omit<TransactionInput, 'date'> & { dueDate?: string | null }} ToPayInput
 */

/**
 * How a due date reads today: none, still ahead, due today (yellow), or overdue (red).
 * @typedef {'none' | 'ahead' | 'today' | 'overdue'} DueTone
 */

/** Fields a user can edit on a To pay. */
export const TO_PAY_EDITABLE_FIELDS = /** @type {const} */ ([
  'kind',
  'amountMinor',
  'accountId',
  'toAccountId',
  'categoryId',
  'payee',
  'note',
  'dueDate',
]);

/**
 * Validates To pay input against the referenced entities, like a transaction without a date.
 * @param {ToPayInput} input
 * @param {TransactionRefs} refs
 * @returns {ToPayFields}
 * @throws {ValidationError}
 */
export function normalizeToPayInput(input, refs) {
  const dueDate = input.dueDate ? input.dueDate : null;
  /** @type {Record<string, string | null>} */
  const errors = { dueDate: dueDate === null || isLocalDate(dueDate) ? null : 'validation.date' };
  /** @type {Omit<TransactionFields, 'date'> | null} */
  let fields = null;
  try {
    const { date: _date, ...rest } = normalizeTransactionInput({ ...input, date: '' }, refs, {
      requireDate: false,
    });
    fields = rest;
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
    Object.assign(errors, error.fields);
  }
  throwIfInvalid(errors);
  return { .../** @type {Omit<TransactionFields, 'date'>} */ (fields), dueDate };
}

/**
 * @param {ToPayFields} fields validated fields
 * @param {EntityContext} ctx
 * @param {string | null} [automationId]
 * @returns {ToPay}
 */
export function createToPay(fields, ctx, automationId = null) {
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
 * The fields of `fields` that differ from the stored To pay.
 * @param {ToPay} current
 * @param {ToPayFields} fields validated fields
 * @returns {Partial<ToPayFields>}
 */
export function toPayEdits(current, fields) {
  /** @type {Partial<ToPayFields>} */
  const changes = {};
  for (const field of TO_PAY_EDITABLE_FIELDS) {
    if (fields[field] !== current[field]) Object.assign(changes, { [field]: fields[field] });
  }
  return changes;
}

/**
 * The ID of the transaction that paying a To pay records. Two devices paying the same To pay write
 * the same transaction, so it counts once. The prefix keeps it apart from automation results,
 * which are found by the `<automationId>:` prefix.
 * @param {string} toPayId
 * @returns {string}
 */
export function toPayPaymentId(toPayId) {
  return `paid:${toPayId}`;
}

/**
 * The transaction that paying a To pay records, dated `today`. It is the user's own: paying is
 * their decision, even for a To pay an automation made.
 * @param {ToPay} toPay
 * @param {LocalDate} today
 * @param {string} now ISO 8601 UTC
 * @returns {Transaction}
 */
export function paymentFor(toPay, today, now) {
  return {
    id: toPayPaymentId(toPay.id),
    kind: toPay.kind,
    date: today,
    amountMinor: toPay.amountMinor,
    accountId: toPay.accountId,
    toAccountId: toPay.toAccountId,
    categoryId: toPay.categoryId,
    payee: toPay.payee,
    note: toPay.note,
    automationId: null,
    createdAt: now,
    updatedAt: now,
    deleted: false,
  };
}

/**
 * Whole days until the due date (negative when overdue), or null without one.
 * @param {LocalDate | null} dueDate
 * @param {LocalDate} today
 * @returns {number | null}
 */
export function daysLeft(dueDate, today) {
  return dueDate === null ? null : daysBetween(today, dueDate);
}

/**
 * @param {LocalDate | null} dueDate
 * @param {LocalDate} today
 * @returns {DueTone}
 */
export function dueTone(dueDate, today) {
  const days = daysLeft(dueDate, today);
  if (days === null) return 'none';
  if (days > 0) return 'ahead';
  return days === 0 ? 'today' : 'overdue';
}

/**
 * Sort comparator: by due date (soonest, so overdue, first), then those without one, then by payee,
 * then by ID for stability.
 * @param {ToPay} a
 * @param {ToPay} b
 * @returns {number}
 */
export function compareToPays(a, b) {
  if (a.dueDate !== b.dueDate) {
    if (a.dueDate === null) return 1;
    if (b.dueDate === null) return -1;
    return a.dueDate < b.dueDate ? -1 : 1;
  }
  return a.payee.localeCompare(b.payee) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
