import { describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORIES } from '../../../src/core/domain/category.js';
import { createTestServices } from '../../helpers/testServices.js';

describe('CategoryService', () => {
  it('seeds defaults once per install with deterministic ids', async () => {
    const t = await createTestServices();
    expect(await t.services.categories.seedDefaults()).toBe(DEFAULT_CATEGORIES.length);
    expect(await t.services.categories.seedDefaults()).toBe(0);
    const all = await t.services.categories.list();
    expect(all.map((c) => c.id)).toContain('seed:groceries');
    expect(await t.services.categories.list({ kind: 'income' })).toHaveLength(
      DEFAULT_CATEGORIES.filter((c) => c.kind === 'income').length,
    );
  });

  it('creates, edits, and archives categories', async () => {
    const t = await createTestServices();
    const pets = await t.services.categories.create({
      name: 'Pets',
      kind: 'expense',
      color: 'amber',
      icon: 'heart',
    });
    await t.services.categories.update(pets.id, {
      name: 'Pet care',
      kind: 'income',
      color: 'rose',
      icon: 'gift',
    });
    expect(await t.services.categories.get(pets.id)).toMatchObject({
      name: 'Pet care',
      kind: 'expense',
      color: 'rose',
    });
    await t.services.categories.setArchived(pets.id, true);
    expect(await t.services.categories.list()).toEqual([]);
  });
});
