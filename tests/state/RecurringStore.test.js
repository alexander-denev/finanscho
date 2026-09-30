import { describe, expect, it } from 'vitest';
import { createTestStores } from '../helpers/testStores.js';

describe('RecurringStore and DashboardStore', () => {
  it('lists rules and upcoming items, and the dashboard follows every change', async () => {
    const t = await createTestStores();
    const { recurring, dashboard, accounts } = t.stores;
    const main = await accounts.create({
      name: 'Main',
      type: 'checking',
      currency: 'EUR',
      openingBalance: '100',
    });
    const rule = await recurring.create({
      frequency: 'monthly',
      interval: 1,
      startDate: '2024-04-20',
      endDate: null,
      template: {
        kind: 'expense',
        amount: '15',
        accountId: main.id,
        categoryId: 'seed:subscriptions',
        payee: 'Music',
      },
    });
    await t.settled();
    expect(recurring.rules.value.map((r) => [r.rule.id, r.nextDate])).toEqual([
      [rule.id, '2024-05-20'],
    ]);
    expect(recurring.upcoming.value.map((u) => u.date)).toEqual(['2024-05-20']);
    expect(dashboard.summary.value?.balances[0].balanceMinor).toBe(10_000 - 1_500);
    expect(dashboard.summary.value?.upcoming).toHaveLength(1);

    await recurring.stop(rule.id);
    await t.settled();
    expect(recurring.upcoming.value).toEqual([]);
    expect(await recurring.materialize()).toBe(0);
    await recurring.remove(rule.id);
    await t.settled();
    expect(recurring.rules.value).toEqual([]);
  });

  it('replaces a rule on edit', async () => {
    const t = await createTestStores();
    const main = await t.stores.accounts.create({
      name: 'Main',
      type: 'checking',
      currency: 'EUR',
      openingBalance: '0',
    });
    const input = {
      frequency: 'monthly',
      interval: 1,
      startDate: '2024-06-01',
      endDate: null,
      template: {
        kind: 'expense',
        amount: '15',
        accountId: main.id,
        categoryId: 'seed:subscriptions',
      },
    };
    const rule = await t.stores.recurring.create(input);
    const next = await t.stores.recurring.edit(rule.id, { ...input, startDate: '2024-07-01' });
    await t.settled();
    expect(t.stores.recurring.rules.value.map((r) => r.rule.id)).toEqual([rule.id, next.id]);
  });
});
