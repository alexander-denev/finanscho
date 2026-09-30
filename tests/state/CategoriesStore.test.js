import { describe, expect, it } from 'vitest';
import { createTestStores } from '../helpers/testStores.js';

describe('CategoriesStore', () => {
  it('derives active income and expense lists and refreshes on edits', async () => {
    const t = await createTestStores();
    const { categories } = t.stores;
    expect(categories.income.value.every((c) => c.kind === 'income')).toBe(true);
    expect(categories.expense.value.length).toBeGreaterThan(5);
    const pets = await categories.create({
      name: 'Pets',
      kind: 'expense',
      color: 'rose',
      icon: 'heart',
    });
    await categories.setArchived('seed:travel', true);
    await t.settled();
    expect(categories.byId.value.get(pets.id)?.name).toBe('Pets');
    expect(categories.expense.value.some((c) => c.id === 'seed:travel')).toBe(false);
    expect(categories.all.value.some((c) => c.id === 'seed:travel')).toBe(true);
    await categories.update(pets.id, {
      name: 'Pet care',
      kind: 'expense',
      color: 'rose',
      icon: 'heart',
    });
    await t.settled();
    expect(categories.byId.value.get(pets.id)?.name).toBe('Pet care');
  });
});
