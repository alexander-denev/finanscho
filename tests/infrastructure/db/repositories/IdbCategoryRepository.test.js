import { describe, expect, it } from 'vitest';
import { IdbCategoryRepository } from '../../../../src/infrastructure/db/repositories/IdbCategoryRepository.js';
import { STORES } from '../../../../src/infrastructure/db/database.js';
import { SEED_HLC } from '../../../../src/infrastructure/sync/HybridLogicalClock.js';
import { buildDefaultCategories } from '../../../../src/core/domain/category.js';
import { createTestDb } from '../../../helpers/testDb.js';

describe('IdbCategoryRepository', () => {
  it('seeds absent categories with the minimum clock, so later edits win', async () => {
    const { db, recorder } = await createTestDb();
    const repo = new IdbCategoryRepository({ db, recorder });
    const seeds = buildDefaultCategories();
    expect(await repo.seed(seeds)).toBe(seeds.length);
    const stored = await db.get(STORES.categories, 'seed:groceries');
    expect(Object.values(stored._clocks).every((c) => c === SEED_HLC)).toBe(true);

    await repo.update('seed:groceries', { name: 'Food', updatedAt: 'u' });
    expect(await repo.seed(seeds)).toBe(0);
    expect((await repo.get('seed:groceries'))?.name).toBe('Food');
  });

  it('lists by kind, hides archived unless asked, and sorts by name', async () => {
    const { db, recorder } = await createTestDb();
    const repo = new IdbCategoryRepository({ db, recorder });
    await repo.seed(buildDefaultCategories());
    await repo.update('seed:travel', { archived: true });
    const expenses = await repo.list({ kind: 'expense' });
    expect(expenses.every((c) => c.kind === 'expense')).toBe(true);
    expect(expenses.some((c) => c.id === 'seed:travel')).toBe(false);
    const names = expenses.map((c) => c.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect((await repo.list({ includeArchived: true })).some((c) => c.id === 'seed:travel')).toBe(
      true,
    );
  });
});
