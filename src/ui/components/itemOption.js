import { accountIcon } from '../../core/domain/account.js';

/** @typedef {import('../../core/domain/itemIcons.js').ItemIcon} ItemIcon */

/**
 * An account as a picker needs it.
 * @typedef {{ id: string, name: string, type: string, color: string | null, icon?: ItemIcon | null }} AccountChoice
 */

/**
 * A category as a picker needs it.
 * @typedef {{ id: string, name: string, kind: string, color: string, icon: ItemIcon }} CategoryChoice
 */

/**
 * An account or category as an `IconSelect` option: its name, icon, and color. Accounts without
 * their own icon show their type's.
 * @param {AccountChoice | CategoryChoice} item
 * @param {string} [group] heading to list it under
 * @returns {import('./IconSelect.jsx').IconSelectOption}
 */
export function itemOption(item, group) {
  return {
    value: item.id,
    label: item.name,
    icon: 'type' in item ? accountIcon(/** @type {AccountChoice} */ (item)) : item.icon,
    color: item.color,
    group,
  };
}
