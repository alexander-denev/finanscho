import { describe, expect, it } from 'vitest';
import { createTestStores } from '../helpers/testStores.js';

describe('DashboardStore', () => {
  it('loads the summary and refreshes it after any data change', async () => {
    const t = await createTestStores();
    const { dashboard, accounts, transactions } = t.stores;
    expect(dashboard.status.value).toBe('idle');
    expect(dashboard.summary.value?.balances).toEqual([]);
    const main = await accounts.create({
      name: 'Main',
      type: 'checking',
      currency: 'EUR',
      openingBalance: '10',
    });
    await t.settled();
    expect(dashboard.summary.value?.totals).toEqual([{ currency: 'EUR', amountMinor: 1_000 }]);
    await transactions.save({
      kind: 'income',
      date: '2024-05-03',
      amount: '5',
      accountId: main.id,
      categoryId: 'seed:salary',
    });
    await t.settled();
    expect(dashboard.summary.value?.monthFlow).toEqual([
      { currency: 'EUR', incomeMinor: 500, expenseMinor: 0 },
    ]);
  });
});
