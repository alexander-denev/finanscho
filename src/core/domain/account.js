import { ITEM_ICONS } from './itemIcons.js';
import { isCurrencyCode, parseMoney } from './money.js';
import {
  checkKeptOrValid,
  checkRequiredText,
  cleanText,
  isOneOf,
  throwIfInvalid,
} from './validation.js';

/** @typedef {import('./validation.js').BaseEntity} BaseEntity */
/** @typedef {import('./validation.js').EntityContext} EntityContext */

export const ACCOUNT_TYPES = /** @type {const} */ ([
  'cash',
  'checking',
  'savings',
  'creditCard',
  'other',
]);

/**
 * Named swatches, in display order; the UI maps each to a theme-aware design token. A color can
 * also be a custom `#rrggbb` (see `isItemColor`).
 */
export const SWATCHES = /** @type {const} */ ([
  'red',
  'rust',
  'orange',
  'amber',
  'gold',
  'sand',
  'brown',
  'olive',
  'lime',
  'green',
  'forest',
  'mint',
  'teal',
  'cyan',
  'sky',
  'blue',
  'navy',
  'indigo',
  'violet',
  'plum',
  'pink',
  'rose',
  'slate',
  'gray',
]);

/** The icon an account shows until the user picks one. */
export const ACCOUNT_TYPE_ICONS = Object.freeze(
  /** @type {const} */ ({
    cash: 'wallet',
    checking: 'bank',
    savings: 'piggyBank',
    creditCard: 'card',
    other: 'dots',
  }),
);

const CUSTOM_COLOR = /^#[0-9a-f]{6}$/;

/** @typedef {(typeof ACCOUNT_TYPES)[number]} AccountType */
/** @typedef {(typeof SWATCHES)[number]} Swatch */
/** @typedef {import('./itemIcons.js').ItemIcon} ItemIcon */
/** @typedef {string} ItemColor a swatch name or a custom lowercase `#rrggbb` */

/**
 * Whether a value is a color an account or category may have: a swatch name or `#rrggbb`.
 * @param {unknown} value
 * @returns {value is ItemColor}
 */
export function isItemColor(value) {
  return isOneOf(value, SWATCHES) || (typeof value === 'string' && CUSTOM_COLOR.test(value));
}

/**
 * The icon to show for an account: its own, else its type's.
 * @param {{ type: string, icon?: ItemIcon | null }} account
 * @returns {ItemIcon}
 */
export function accountIcon(account) {
  return (
    account.icon ??
    ACCOUNT_TYPE_ICONS[/** @type {AccountType} */ (account.type)] ??
    ACCOUNT_TYPE_ICONS.other
  );
}

/**
 * @typedef {BaseEntity & {
 *   name: string,
 *   type: AccountType,
 *   currency: string,
 *   openingBalanceMinor: number,
 *   color: ItemColor | null,
 *   icon?: ItemIcon | null,
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
 * @property {string | null} [icon] null shows the type's icon
 */

/** @typedef {{ name: string, type: AccountType, openingBalanceMinor: number, color: ItemColor | null, icon: ItemIcon | null }} AccountFields */

/**
 * Validates input and returns normalized fields.
 * @param {AccountInput} input
 * @param {string} currency the currency used to parse the opening balance
 * @param {Account} [existing] the account being edited
 * @returns {AccountFields}
 */
function normalize(input, currency, existing) {
  const balance = parseMoney(input.openingBalance === '' ? '0' : input.openingBalance, currency, {
    allowNegative: true,
  });
  const color = input.color ?? null;
  const icon = input.icon ?? null;
  throwIfInvalid({
    name: checkRequiredText(input.name),
    type: isOneOf(input.type, ACCOUNT_TYPES) ? null : 'validation.required',
    currency: isCurrencyCode(currency) ? null : 'validation.currency',
    openingBalance: balance.ok ? null : `validation.money.${balance.error}`,
    color: color === null ? null : checkKeptOrValid(color, isItemColor, existing?.color),
    icon:
      icon === null
        ? null
        : checkKeptOrValid(icon, (value) => isOneOf(value, ITEM_ICONS), existing?.icon),
  });
  return {
    name: cleanText(input.name),
    type: /** @type {AccountType} */ (input.type),
    openingBalanceMinor: balance.ok ? balance.minor : 0,
    color,
    icon: /** @type {ItemIcon | null} */ (icon),
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
 * @returns {AccountFields}
 * @throws {import('../errors.js').ValidationError}
 */
export function accountEdits(existing, input) {
  return normalize(input, existing.currency, existing);
}
