import { isCurrencyCode, parseMoney } from './money.js';
import { checkRequiredText, cleanText, isOneOf, throwIfInvalid } from './validation.js';

/** @typedef {import('./validation.js').BaseEntity} BaseEntity */
/** @typedef {import('./validation.js').EntityContext} EntityContext */

export const ACCOUNT_TYPES = /** @type {const} */ ([
  'cash',
  'checking',
  'savings',
  'creditCard',
  'other',
]);

/** Named swatches; the UI maps each to a theme-aware design token. */
export const SWATCHES = /** @type {const} */ ([
  'teal',
  'blue',
  'plum',
  'amber',
  'rust',
  'olive',
  'rose',
  'slate',
]);

/** @typedef {(typeof ACCOUNT_TYPES)[number]} AccountType */
/** @typedef {(typeof SWATCHES)[number]} Swatch */

/**
 * @typedef {BaseEntity & {
 *   name: string,
 *   type: AccountType,
 *   currency: string,
 *   openingBalanceMinor: number,
 *   color: Swatch | null,
 *   archived: boolean,
 * }} Account
 */

/**
 * User input for creating or editing an account. Money is a user-typed string.
 * @typedef {object} AccountInput
 * @property {string} name
 * @property {string} type
 * @property {string} currency ISO 4217; ignored on edit (currency is fixed after creation)
 * @property {string} openingBalance may be negative (e.g. credit card debt)
 * @property {string | null} [color]
 */

/**
 * Validates input and returns normalized fields.
 * @param {AccountInput} input
 * @param {string} currency the currency used to parse the opening balance
 * @returns {{ name: string, type: AccountType, openingBalanceMinor: number, color: Swatch | null }}
 */
function normalize(input, currency) {
  const balance = parseMoney(input.openingBalance === '' ? '0' : input.openingBalance, currency, {
    allowNegative: true,
  });
  const color = input.color ?? null;
  throwIfInvalid({
    name: checkRequiredText(input.name),
    type: isOneOf(input.type, ACCOUNT_TYPES) ? null : 'validation.required',
    currency: isCurrencyCode(currency) ? null : 'validation.currency',
    openingBalance: balance.ok ? null : `validation.money.${balance.error}`,
    color: color === null || isOneOf(color, SWATCHES) ? null : 'validation.invalid',
  });
  return {
    name: cleanText(input.name),
    type: /** @type {AccountType} */ (input.type),
    openingBalanceMinor: balance.ok ? balance.minor : 0,
    color: /** @type {Swatch | null} */ (color),
  };
}

/**
 * Builds a new account from validated input.
 * @param {AccountInput} input
 * @param {EntityContext} ctx
 * @returns {Account}
 * @throws {import('../errors.js').ValidationError}
 */
export function createAccount(input, ctx) {
  const currency = typeof input.currency === 'string' ? input.currency.toUpperCase() : '';
  const fields = normalize(input, currency);
  return {
    id: ctx.id,
    ...fields,
    currency,
    archived: false,
    createdAt: ctx.now,
    updatedAt: ctx.now,
    deleted: false,
  };
}

/**
 * Validates an edit and returns the editable fields. Currency cannot change after creation.
 * @param {Account} existing
 * @param {AccountInput} input
 * @returns {{ name: string, type: AccountType, openingBalanceMinor: number, color: Swatch | null }}
 * @throws {import('../errors.js').ValidationError}
 */
export function accountEdits(existing, input) {
  return normalize(input, existing.currency);
}
