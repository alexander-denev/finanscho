import { describe, expect, it } from 'vitest';
import { createTestServices, makeAccount } from '../../helpers/testServices.js';

describe('DashboardService', () => {
  it('summarizes balances, totals per currency, month flow, budgets, and upcoming items', async () => {
    const t = await createTestServices();
    await t.services.categories.seedDefaults();
    const main = await makeAccount(t, 'Main', '100');
    const savings = await makeAccount(t, 'Savings', '1000');
    const usd = await makeAccount(t, 'Dollars', '10', 'USD');
    const tx = t.services.transactions;
    await tx.create({
      kind: 'income',
      date: '2024-05-01',
      amount: '2000',
      accountId: main.id,
      categoryId: 'seed:salary',
    });
    await tx.create({
      kind: 'expense',
      date: '2024-05-03',
      amount: '150',
      accountId: main.id,
      categoryId: 'seed:groceries',
    });
    await tx.create({
      kind: 'expense',
      date: '2024-04-28',
      amount: '70',
      accountId: main.id,
      categoryId: 'seed:groceries',
    });
    await tx.create({
      kind: 'transfer',
      date: '2024-05-05',
      amount: '500',
      accountId: main.id,
      toAccountId: savings.id,
    });
    await tx.create({
      kind: 'expense',
      date: '2024-05-06',
      amount: '5',
      accountId: usd.id,
      categoryId: 'seed:dining',
    });
    await t.services.budgets.set({ categoryId: 'seed:groceries', month: '2024-05', limit: '100' });
    await t.services.automations.create({
      name: 'Stream',
      startDate: '2024-05-20',
      triggers: [{ type: 'schedule', frequency: 'monthly', interval: 1, firstDate: '2024-05-20' }],
      actions: [
        {
          type: 'createTransaction',
          template: { kind: 'expense', accountId: main.id, categoryId: 'seed:subscriptions' },
          amount: { type: 'fixed', value: '30' },
        },
      ],
    });

    const summary = await t.services.dashboard.summary();
    expect(summary.month).toBe('2024-05');
    expect(
      Object.fromEntries(summary.balances.map((b) => [b.account.name, b.balanceMinor])),
    ).toEqual({
      Main: 10_000 + 200_000 - 15_000 - 7_000 - 50_000,
      Savings: 150_000,
      Dollars: 500,
    });
    expect(summary.totals).toEqual([
      { currency: 'EUR', amountMinor: 138_000 + 150_000 },
      { currency: 'USD', amountMinor: 500 },
    ]);
    expect(summary.monthFlow).toEqual([
      { currency: 'EUR', incomeMinor: 200_000, expenseMinor: 15_000 },
      { currency: 'USD', incomeMinor: 0, expenseMinor: 500 },
    ]);
    expect(summary.budgets.over).toBe(1);
    expect(summary.upcoming.map((u) => u.date)).toEqual(['2024-05-20']);
  });

  it('counts balance adjustments in balances but not in month income or spending', async () => {
    const t = await createTestServices();
    const main = await makeAccount(t, 'Main', '100');
    await t.services.transactions.create({
      kind: 'expense',
      date: '2024-05-03',
      amount: '10',
      accountId: main.id,
    });
    await t.services.accounts.reconcile(main.id, { balance: '50' });
    const summary = await t.services.dashboard.summary();
    expect(summary.balances[0].balanceMinor).toBe(5_000);
    expect(summary.monthFlow).toEqual([{ currency: 'EUR', incomeMinor: 0, expenseMinor: 1_000 }]);
  });
});
