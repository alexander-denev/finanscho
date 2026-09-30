import { describe, expect, it } from 'vitest';
import { createTestStores } from '../helpers/testStores.js';

describe('BudgetsStore', () => {
  it('manages budgets for the selected month and reacts to spending', async () => {
    const t = await createTestStores();
    const { budgets, transactions, accounts } = t.stores;
    expect(budgets.month.value).toBe('2024-05');
    const main = await accounts.create({
      name: 'Main',
      type: 'checking',
      currency: 'EUR',
      openingBalance: '0',
    });
    await budgets.setBudget('seed:groceries', '200');
    await budgets.setBudget('seed:dining', '50');
    await transactions.save({
      kind: 'expense',
      date: '2024-05-03',
      amount: '60',
      accountId: main.id,
      categoryId: 'seed:dining',
    });
    await t.settled();
    const lines = budgets.data.value?.lines ?? [];
    expect(lines.map((l) => [l.category.id, l.progress.status])).toEqual([
      ['seed:dining', 'over'],
      ['seed:groceries', 'under'],
    ]);
    expect(budgets.totals.value).toEqual([
      { currency: 'EUR', limitMinor: 25_000, spentMinor: 6_000 },
    ]);

    await budgets.shiftMonth(1);
    expect(budgets.month.value).toBe('2024-06');
    expect(budgets.data.value?.lines).toEqual([]);
    expect(await budgets.copyPreviousMonth()).toBe(2);
    await t.settled();
    expect(budgets.data.value?.lines).toHaveLength(2);
    const dining = budgets.data.value?.lines.find((l) => l.category.id === 'seed:dining');
    await budgets.removeBudget(dining?.budget.id ?? '');
    await t.settled();
    expect(budgets.data.value?.lines).toHaveLength(1);
  });
});
