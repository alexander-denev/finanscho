import { describe, expect, it } from 'vitest';
import { ITEM_ICONS } from '../../../src/core/domain/itemIcons.js';
import { DEFAULT_CATEGORIES } from '../../../src/core/domain/category.js';
import { ACCOUNT_TYPE_ICONS } from '../../../src/core/domain/account.js';
import { hasTranslation } from '../../../src/ui/i18n/i18n.js';
import { ITEM_ICON_GROUPS } from '../../../src/ui/icons/itemIconGroups.js';
import { ITEM_ICON_PATHS } from '../../../src/ui/icons/itemIconPaths.js';

/** Keys stored in data before the icon pool grew; they must never disappear. */
const LEGACY_KEYS = [
  'cart',
  'home',
  'bolt',
  'car',
  'utensils',
  'heart',
  'film',
  'shirt',
  'plane',
  'book',
  'gift',
  'phone',
  'briefcase',
  'coins',
  'arrowIn',
  'dots',
];

describe('item icons', () => {
  it('keeps every key that existing data may store', () => {
    expect(ITEM_ICONS).toEqual(expect.arrayContaining(LEGACY_KEYS));
    for (const category of DEFAULT_CATEGORIES) expect(ITEM_ICONS).toContain(category.icon);
    for (const icon of Object.values(ACCOUNT_TYPE_ICONS)) expect(ITEM_ICONS).toContain(icon);
  });

  it('lists each key in exactly one group', () => {
    const grouped = ITEM_ICON_GROUPS.flatMap((group) => group.icons);
    expect([...grouped].sort()).toEqual([...ITEM_ICONS].sort());
    expect(new Set(grouped).size).toBe(grouped.length);
  });

  it('has a drawing, a name, and search words for every key, and a name for every group', () => {
    for (const icon of ITEM_ICONS) {
      expect(ITEM_ICON_PATHS[icon]).toMatch(/^M/);
      expect(hasTranslation(`icon.${icon}`)).toBe(true);
      expect(hasTranslation(`iconTags.${icon}`)).toBe(true);
    }
    for (const { group } of ITEM_ICON_GROUPS)
      expect(hasTranslation(`iconGroup.${group}`)).toBe(true);
  });
});
