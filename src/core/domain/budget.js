import { isYearMonth } from './localDate.js';
import { parseMoney } from './money.js';
import { throwIfInvalid } from './validation.js';

/** @typedef {import('./validation.js').BaseEntity} BaseEntity */
/** @typedef {import('./localDate.js').YearMonth} YearMonth */

/**
 * A monthly spending limit for one expense category. The ID is deterministic
 * (`<categoryId>:<YYYY-MM>`) so two devices setting the same budget converge on one record.
 * `automationId` names the automation that set it (null when the user did). `recurring` is the
 * "repeat every month" flag of app versions before automations (D50): new writes always set it to
 * false, so those versions never copy a budget forward that this version wrote.
 * @typedef {BaseEntity & {
 *   categoryId: string,
 *   month: YearMonth,
 *   limitMinor: number,
 *   currency: string,
 *   automationId?: string | null,
 *   recurring?: boolean,
 * }} Budget
 */

/**
 * @typedef {object} BudgetInput
 * @property {string} categoryId
 * @property {string} month 'YYYY-MM'
 * @property {string} limit user-typed amount
 */

/**
 * Budget status derived from spending. Never stored.
 * @typedef {object} BudgetProgress
 * @property {number} limitMinor
 * @property {number} spentMinor
 * @property {number} remainingMinor negative when over budget
 * @property {number} ratio spent / limit, 0 when the limit is 0
 * @property {'under' | 'near' | 'over'} status near = at least 85% spent
 */

/** Fraction of the limit at which a budget counts as "near". */
export const NEAR_LIMIT_RATIO = 0.85;

/**
 * @param {string} categoryId
 * @param {YearMonth} month
 * @returns {string}
 */
export function budgetId(categoryId, month) {
  return `${categoryId}:${month}`;
}

/**
 * Splits a deterministic budget ID into its category and month. Category IDs may contain colons
 * (`seed:groceries`), so the month is the part after the last one.
 * @param {string} id
 * @returns {{ categoryId: string, month: string }}
 */
export function parseBudgetId(id) {
  const split = id.lastIndexOf(':');
  return { categoryId: id.slice(0, split), month: id.slice(split + 1) };
}

/**
 * Validates budget input and returns the budget's fields (without audit fields).
 * @param {BudgetInput} input
 * @param {{ kind: 'income' | 'expense' } | null} category
 * @param {string} currency
 * @returns {{ id: string, categoryId: string, month: YearMonth, limitMinor: number, currency: string, automationId: null, recurring: false }}
 * @throws {import('../errors.js').ValidationError}
 */
export function normalizeBudgetInput(input, category, currency) {
  const limit = parseMoney(input.limit, currency);
  throwIfInvalid({
    categoryId:
      category === null
        ? 'validation.required'
        : category.kind !== 'expense'
          ? 'validation.categoryKind'
          : null,
    month: isYearMonth(input.month) ? null : 'validation.month',
    limit: limit.ok ? null : `validation.money.${limit.error}`,
  });
  return {
    id: budgetId(input.categoryId, input.month),
    categoryId: input.categoryId,
    month: input.month,
    limitMinor: limit.ok ? limit.minor : 0,
    currency,
    automationId: null,
    recurring: false,
  };
}

/**
 * @param {number} limitMinor
 * @param {number} spentMinor
 * @returns {BudgetProgress}
 */
export function budgetProgress(limitMinor, spentMinor) {
  const ratio = limitMinor > 0 ? spentMinor / limitMinor : spentMinor > 0 ? Infinity : 0;
  /** @type {BudgetProgress['status']} */
  const status = ratio > 1 ? 'over' : ratio >= NEAR_LIMIT_RATIO ? 'near' : 'under';
  return { limitMinor, spentMinor, remainingMinor: limitMinor - spentMinor, ratio, status };
}
