import { describe, expect, it } from 'vitest';
import { IdbBudgetRepository } from '../../../../src/infrastructure/db/repositories/IdbBudgetRepository.js';
import { createTestDb } from '../../../helpers/testDb.js';

/**
 * @param {string} id
 * @param {number} limitMinor
 */
const budget = (id, limitMinor) => ({
  id,
  categoryId: id.split(':')[0],
  month: id.split(':')[1],
  limitMinor,
  currency: 'EUR',
  createdAt: 't',
  updatedAt: 't',
  deleted: false,
});

describe('IdbBudgetRepository', () => {
  it('puts, lists by month, removes, and restores budgets', async () => {
    const repo = new IdbBudgetRepository(await createTestDb());
    await repo.put(budget('food:2024-05', 100));
    await repo.put(budget('fun:2024-05', 50));
    await repo.put(budget('food:2024-06', 70));
    expect((await repo.listByMonth('2024-05')).map((b) => b.id).sort()).toEqual([
      'food:2024-05',
      'fun:2024-05',
    ]);
    await repo.remove('fun:2024-05', 'u');
    expect((await repo.listByMonth('2024-05')).map((b) => b.id)).toEqual(['food:2024-05']);
    await repo.put(budget('fun:2024-05', 80));
    expect((await repo.get('fun:2024-05'))?.limitMinor).toBe(80);
  });
});
