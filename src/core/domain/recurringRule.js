import { ValidationError } from '../errors.js';
import { addDays, isLocalDate } from './localDate.js';
import { FREQUENCIES, occurrencesBetween } from './recurrenceSchedule.js';
import { normalizeTransactionInput } from './transaction.js';
import { isOneOf, throwIfInvalid } from './validation.js';

/** @typedef {import('./validation.js').BaseEntity} BaseEntity */
/** @typedef {import('./validation.js').EntityContext} EntityContext */
/** @typedef {import('./localDate.js').LocalDate} LocalDate */
/** @typedef {import('./recurrenceSchedule.js').Frequency} Frequency */
/** @typedef {import('./transaction.js').Transaction} Transaction */
/** @typedef {import('./transaction.js').TransactionFields} TransactionFields */
/** @typedef {import('./transaction.js').TransactionInput} TransactionInput */
/** @typedef {import('./transaction.js').TransactionRefs} TransactionRefs */

/** Maximum occurrences materialized per rule in one run (catch-up cap). */
export const MATERIALIZE_CAP = 366;
export const MAX_INTERVAL = 999;

/** @typedef {Omit<TransactionFields, 'date'>} RuleTemplate */

/**
 * A recurring rule. Schedule and template are immutable after creation; only `endDate` and
 * `deleted` may change. Changing the template or schedule ends this rule and creates a new one
 * whose `previousRuleId` points back here (absent on rules created before that field existed);
 * stopping, resuming, or moving the end date changes `endDate` in place.
 * @typedef {BaseEntity & {
 *   frequency: Frequency,
 *   interval: number,
 *   startDate: LocalDate,
 *   endDate: LocalDate | null,
 *   template: RuleTemplate,
 *   previousRuleId?: string | null,
 * }} RecurringRule
 */

/**
 * @typedef {object} RecurringRuleInput
 * @property {string} frequency
 * @property {number | string} interval
 * @property {string} startDate
 * @property {string | null} [endDate]
 * @property {Omit<TransactionInput, 'date'>} template
 */

/**
 * Fields of a rule that may change after creation.
 * @type {ReadonlyArray<keyof RecurringRule>}
 */
export const MUTABLE_RULE_FIELDS = ['endDate', 'deleted', 'updatedAt'];

/**
 * @param {string} ruleId
 * @param {LocalDate} date
 * @returns {string}
 */
export function occurrenceId(ruleId, date) {
  return `${ruleId}:${date}`;
}

/**
 * Validates rule input (schedule and template) and returns the rule's immutable fields.
 * @param {RecurringRuleInput} input
 * @param {TransactionRefs} refs
 * @returns {{ frequency: Frequency, interval: number, startDate: LocalDate, endDate: LocalDate | null, template: RuleTemplate }}
 * @throws {import('../errors.js').ValidationError}
 */
export function normalizeRuleInput(input, refs) {
  const interval = Number(input.interval);
  const endDate = input.endDate ? input.endDate : null;
  /** @type {Record<string, string>} */
  let templateErrors = {};
  /** @type {RuleTemplate | null} */
  let template = null;
  try {
    const fields = normalizeTransactionInput({ ...input.template, date: '' }, refs, {
      requireDate: false,
    });
    template = {
      kind: fields.kind,
      amountMinor: fields.amountMinor,
      accountId: fields.accountId,
      toAccountId: fields.toAccountId,
      categoryId: fields.categoryId,
      payee: fields.payee,
      note: fields.note,
    };
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
    templateErrors = error.fields;
  }
  throwIfInvalid({
    frequency: isOneOf(input.frequency, FREQUENCIES) ? null : 'validation.required',
    interval:
      Number.isInteger(interval) && interval >= 1 && interval <= MAX_INTERVAL
        ? null
        : 'validation.interval',
    startDate: isLocalDate(input.startDate) ? null : 'validation.date',
    endDate:
      endDate === null
        ? null
        : !isLocalDate(endDate)
          ? 'validation.date'
          : isLocalDate(input.startDate) && endDate < input.startDate
            ? 'validation.endBeforeStart'
            : null,
    ...templateErrors,
  });
  return {
    frequency: /** @type {Frequency} */ (input.frequency),
    interval,
    startDate: input.startDate,
    endDate,
    template: /** @type {RuleTemplate} */ (template),
  };
}

/**
 * @param {ReturnType<typeof normalizeRuleInput>} fields
 * @param {EntityContext} ctx
 * @param {string | null} [previousRuleId] the rule this one replaces
 * @returns {RecurringRule}
 */
export function createRecurringRule(fields, ctx, previousRuleId = null) {
  return {
    id: ctx.id,
    ...fields,
    template: { ...fields.template },
    previousRuleId,
    createdAt: ctx.now,
    updatedAt: ctx.now,
    deleted: false,
  };
}

/**
 * Whether two rules repeat the same transaction on the same cadence (ignoring start and end).
 * @param {Pick<RecurringRule, 'frequency' | 'interval' | 'template'>} a
 * @param {Pick<RecurringRule, 'frequency' | 'interval' | 'template'>} b
 * @returns {boolean}
 */
export function sameRecurrence(a, b) {
  if (a.frequency !== b.frequency || a.interval !== b.interval) return false;
  const keys = /** @type {(keyof RuleTemplate)[]} */ (Object.keys(a.template));
  return (
    keys.length === Object.keys(b.template).length &&
    keys.every((key) => a.template[key] === b.template[key])
  );
}

/**
 * Whether `date` is one of the rule's occurrence dates, ignoring its end date.
 * @param {RecurringRule} rule
 * @param {LocalDate} date
 * @returns {boolean}
 */
export function isOnSchedule(rule, date) {
  return occurrencesBetween({ ...rule, endDate: null }, date, date, 1)[0] === date;
}

/**
 * Where a stopped rule picks up again: its first occurrence date on or after today that comes
 * after its end date, so nothing it already created is created twice.
 * @param {RecurringRule} rule
 * @param {LocalDate} today
 * @returns {LocalDate}
 */
export function resumeDate(rule, today) {
  const dayAfterEnd = rule.endDate === null ? today : addDays(rule.endDate, 1);
  const from = dayAfterEnd > today ? dayAfterEnd : today;
  return occurrencesBetween({ ...rule, endDate: null }, from, '9999-12-31', 1)[0];
}

/**
 * The occurrence dates a rule skips when it restarts at `effectiveDate`: those after its end
 * date and before the restart. Empty when the rule has no end date.
 * @param {RecurringRule} rule
 * @param {LocalDate} effectiveDate an occurrence date of the rule
 * @returns {LocalDate[]}
 */
export function skippedDates(rule, effectiveDate) {
  if (rule.endDate === null) return [];
  return occurrencesBetween(
    { ...rule, endDate: null },
    addDays(rule.endDate, 1),
    addDays(effectiveDate, -1),
  );
}

/**
 * Builds the transaction for one occurrence. Every field derives from the rule (including audit
 * timestamps), so two devices materializing the same occurrence produce byte-identical records.
 * @param {RecurringRule} rule
 * @param {LocalDate} date
 * @returns {Transaction}
 */
export function buildOccurrence(rule, date) {
  return {
    id: occurrenceId(rule.id, date),
    ...rule.template,
    date,
    recurringRuleId: rule.id,
    createdAt: rule.createdAt,
    updatedAt: rule.createdAt,
    deleted: false,
  };
}

/**
 * The end date to set on an existing rule when the user "edits" it effective from `effectiveDate`:
 * the day before, but never later than an end date the rule already has.
 * @param {RecurringRule} rule
 * @param {LocalDate} effectiveDate
 * @returns {LocalDate}
 */
export function endDateForEdit(rule, effectiveDate) {
  const dayBefore = addDays(effectiveDate, -1);
  return rule.endDate !== null && rule.endDate < dayBefore ? rule.endDate : dayBefore;
}
