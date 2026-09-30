import { describe, expect, it } from 'vitest';
import { effect } from '@preact/signals-core';
import { createTestStores } from '../helpers/testStores.js';

describe('AccountsStore', () => {
  it('loads accounts with balances and derives active, archived, and totals', async () => {
    const { stores, settled } = await createTestStores();
    const { accounts } = stores;
    expect(accounts.items.value).toEqual([]);
    const main = await accounts.create({
      name: 'Main',
      type: 'checking',
      currency: 'EUR',
      openingBalance: '100',
    });
    await accounts.create({ name: 'Cash', type: 'cash', currency: 'EUR', openingBalance: '20' });
    await accounts.create({ name: 'Dollars', type: 'cash', currency: 'USD', openingBalance: '5' });
    await settled();
    expect(accounts.active.value.map((a) => a.account.name)).toEqual(['Cash', 'Dollars', 'Main']);
    expect(accounts.totals.value).toEqual([
      { currency: 'EUR', amountMinor: 12_000 },
      { currency: 'USD', amountMinor: 500 },
    ]);
    expect(accounts.byId.value.get(main.id)?.name).toBe('Main');

    await accounts.setArchived(main.id, true);
    await settled();
    expect(accounts.archived.value.map((a) => a.account.name)).toEqual(['Main']);
    expect(accounts.totals.value[0]).toEqual({ currency: 'EUR', amountMinor: 2_000 });
  });

  it('refreshes balances when a transaction is added (change feed invalidation)', async () => {
    const { stores, settled } = await createTestStores();
    const main = await stores.accounts.create({
      name: 'Main',
      type: 'checking',
      currency: 'EUR',
      openingBalance: '0',
    });
    await settled();
    /** @type {number[]} */
    const seen = [];
    const stop = effect(() => {
      const item = stores.accounts.items.value.find((i) => i.account.id === main.id);
      if (item) seen.push(item.balanceMinor);
    });
    await stores.transactions.save({
      kind: 'expense',
      date: '2024-05-02',
      amount: '7.5',
      accountId: main.id,
      categoryId: 'seed:groceries',
    });
    await settled();
    stop();
    expect(seen).toEqual([0, -750]);
    expect(stores.accounts.status.value).toBe('idle');
  });

  it('exposes signals typed as read-only (checked by tsc)', async () => {
    const { stores } = await createTestStores();
    // Never called: this is a compile-time assertion. If store signals became writable from the
    // outside, the directive below would be unused and `npm run typecheck` would fail.
    const writeFromOutside = () => {
      // @ts-expect-error ReadonlySignal has no setter, so UI code cannot assign store state.
      stores.accounts.items.value = [];
    };
    expect(typeof writeFromOutside).toBe('function');
  });
});
