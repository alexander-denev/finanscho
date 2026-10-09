import { isItemColor } from './account.js';
import { ITEM_ICONS } from './itemIcons.js';
import {
  checkKeptOrValid,
  checkRequiredText,
  cleanText,
  isOneOf,
  throwIfInvalid,
} from './validation.js';

/** @typedef {import('./validation.js').BaseEntity} BaseEntity */
/** @typedef {import('./validation.js').EntityContext} EntityContext */
/** @typedef {import('./account.js').Swatch} Swatch */
/** @typedef {import('./account.js').ItemColor} ItemColor */
/** @typedef {import('./itemIcons.js').ItemIcon} ItemIcon */

export const CATEGORY_KINDS = /** @type {const} */ (['income', 'expense']);

/** @typedef {(typeof CATEGORY_KINDS)[number]} CategoryKind */

/**
 * @typedef {BaseEntity & {
 *   name: string,
 *   kind: CategoryKind,
 *   color: ItemColor,
 *   icon: ItemIcon,
 *   archived: boolean,
 * }} Category
 */

/**
 * @typedef {object} CategoryInput
 * @property {string} name
 * @property {string} kind
 * @property {string} color
 * @property {string} icon
 */

/** Prefix of deterministic IDs for seeded default categories. */
export const SEED_ID_PREFIX = 'seed:';

/**
 * Default categories seeded on first run. IDs are deterministic (`seed:<slug>`) so two devices
 * seeding independently produce the same records. Names are stored in English, the only v1
 * locale, so seeded records are identical on every device.
 * @type {ReadonlyArray<{ slug: string, name: string, kind: CategoryKind, color: Swatch, icon: ItemIcon }>}
 */
export const DEFAULT_CATEGORIES = [
  { slug: 'groceries', name: 'Groceries', kind: 'expense', color: 'olive', icon: 'cart' },
  { slug: 'housing', name: 'Housing', kind: 'expense', color: 'slate', icon: 'home' },
  { slug: 'utilities', name: 'Utilities', kind: 'expense', color: 'amber', icon: 'bolt' },
  { slug: 'transport', name: 'Transport', kind: 'expense', color: 'blue', icon: 'car' },
  { slug: 'dining', name: 'Eating out', kind: 'expense', color: 'rust', icon: 'utensils' },
  { slug: 'health', name: 'Health', kind: 'expense', color: 'rose', icon: 'heart' },
  { slug: 'entertainment', name: 'Entertainment', kind: 'expense', color: 'plum', icon: 'film' },
  { slug: 'shopping', name: 'Shopping', kind: 'expense', color: 'teal', icon: 'shirt' },
  { slug: 'travel', name: 'Travel', kind: 'expense', color: 'blue', icon: 'plane' },
  { slug: 'education', name: 'Education', kind: 'expense', color: 'slate', icon: 'book' },
  { slug: 'gifts', name: 'Gifts', kind: 'expense', color: 'rose', icon: 'gift' },
  { slug: 'subscriptions', name: 'Subscriptions', kind: 'expense', color: 'plum', icon: 'phone' },
  { slug: 'other-expense', name: 'Other expenses', kind: 'expense', color: 'slate', icon: 'dots' },
  { slug: 'salary', name: 'Salary', kind: 'income', color: 'teal', icon: 'briefcase' },
  { slug: 'interest', name: 'Interest', kind: 'income', color: 'olive', icon: 'coins' },
  { slug: 'other-income', name: 'Other income', kind: 'income', color: 'amber', icon: 'arrowIn' },
];

/**
 * @param {CategoryInput} input
 * @param {Category} [existing] the category being edited
 * @returns {{ name: string, kind: CategoryKind, color: ItemColor, icon: ItemIcon }}
 */
function normalize(input, existing) {
  throwIfInvalid({
    name: checkRequiredText(input.name),
    kind: isOneOf(input.kind, CATEGORY_KINDS) ? null : 'validation.required',
    color: input.color
      ? checkKeptOrValid(input.color, isItemColor, existing?.color)
      : 'validation.required',
    icon: input.icon
      ? checkKeptOrValid(input.icon, (value) => isOneOf(value, ITEM_ICONS), existing?.icon)
      : 'validation.required',
  });
  return {
    name: cleanText(input.name),
    kind: /** @type {CategoryKind} */ (input.kind),
    color: input.color,
    icon: /** @type {ItemIcon} */ (input.icon),
  };
}

/**
 * @param {CategoryInput} input
 * @param {EntityContext} ctx
 * @returns {Category}
 * @throws {import('../errors.js').ValidationError}
 */
export function createCategory(input, ctx) {
  return {
    id: ctx.id,
    ...normalize(input),
    archived: false,
    createdAt: ctx.now,
    updatedAt: ctx.now,
    deleted: false,
  };
}

/**
 * Validates an edit. The kind cannot change once transactions may reference the category, so
 * edits keep the existing kind.
 * @param {Category} existing
 * @param {CategoryInput} input
 * @returns {{ name: string, color: ItemColor, icon: ItemIcon }}
 * @throws {import('../errors.js').ValidationError}
 */
export function categoryEdits(existing, input) {
  const { name, color, icon } = normalize({ ...input, kind: existing.kind }, existing);
  return { name, color, icon };
}

/**
 * Builds the seeded default categories. `createdAt` is a fixed epoch value so the records are
 * byte-identical on every device.
 * @returns {Category[]}
 */
export function buildDefaultCategories() {
  const epoch = new Date(0).toISOString();
  return DEFAULT_CATEGORIES.map(({ slug, name, kind, color, icon }) => ({
    id: `${SEED_ID_PREFIX}${slug}`,
    name,
    kind,
    color,
    icon,
    archived: false,
    createdAt: epoch,
    updatedAt: epoch,
    deleted: false,
  }));
}
