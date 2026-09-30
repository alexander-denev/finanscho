import { beforeEach, describe, expect, it } from 'vitest';
import { PAGE_SIZE } from '../../src/state/TransactionsStore.js';
import { createTestStores } from '../helpers/testStores.js';

describe('TransactionsStore', () => {
  /** @type {Awaited<ReturnType<typeof createTestStores>>} */
  let t;
  /** @type {string} */
  let main;
  /** @type {string} */
  let savings;

  beforeEach(async () => {
    t = await createTestStores();
    main = (
      await t.stores.accounts.create({
        name: 'Main',
        type: 'checking',
        currency: 'EUR',
        openingBalance: '0',
      })
    ).id;
    savings = (
      await t.stores.accounts.create({
        name: 'Savings',
        type: 'savings',
        currency: 'EUR',
        openingBalance: '0',
      })
    ).id;
    await t.settled();
  });

  /**
   * @param {string} date
   * @param {string} amount
   * @param {Partial<import('../../src/core/domain/transaction.js').TransactionInput>} [over]
   */
  const add = (date, amount, over = {}) =>
    t.stores.transactions.save({
      kind: 'expense',
      date,
      amount,
      accountId: main,
      categoryId: 'seed:groceries',
      ...over,
    });

  it('groups by day with per-day net and refreshes on change', async () => {
    await add('2024-05-02', '10');
    await add('2024-05-02', '2.5', { kind: 'income', categoryId: 'seed:salary' });
    await add('2024-05-03', '4');
    await add('2024-05-03', '100', { kind: 'transfer', toAccountId: savings, categoryId: null });
    await t.settled();
    const days = t.stores.transactions.days.value;
    expect(days.map((d) => [d.date, d.items.length, d.net])).toEqual([
      ['2024-05-03', 2, [{ currency: 'EUR', amountMinor: -400 }]],
      ['2024-05-02', 2, [{ currency: 'EUR', amountMinor: -750 }]],
    ]);
    expect(t.stores.transactions.total.value).toEqual([{ currency: 'EUR', amountMinor: -1150 }]);
  });

  it('counts transfers when filtering by account', async () => {
    await add('2024-05-03', '100', { kind: 'transfer', toAccountId: savings, categoryId: null });
    await t.stores.transactions.setFilter({ accountId: savings });
    expect(t.stores.transactions.total.value).toEqual([{ currency: 'EUR', amountMinor: 10_000 }]);
  });

  it('filters by month, category, and search, and clears filters', async () => {
    await add('2024-04-30', '1', { payee: 'Bakery' });
    await add('2024-05-01', '2', { categoryId: 'seed:dining', note: 'pizza night' });
    await add('2024-05-02', '3');
    await t.settled();
    const amounts = () => t.stores.transactions.items.value.map((x) => x.amountMinor);
    await t.stores.transactions.setFilter({ month: '2024-05' });
    expect(amounts()).toEqual([300, 200]);
    await t.stores.transactions.setFilter({ categoryId: 'seed:dining' });
    expect(amounts()).toEqual([200]);
    await t.stores.transactions.setFilter({ categoryId: null, month: null, search: 'bak' });
    expect(amounts()).toEqual([100]);
    await t.stores.transactions.clearFilter();
    expect(amounts()).toEqual([300, 200, 100]);
    expect(t.stores.transactions.filter.value).toEqual({
      accountId: null,
      categoryId: null,
      month: null,
      search: '',
    });
  });

  it('loads one page at a time', async () => {
    for (let i = 0; i < PAGE_SIZE + 5; i += 1) {
      await add(`2024-05-${String(1 + (i % 28)).padStart(2, '0')}`, String(i + 1));
    }
    await t.settled();
    expect(t.stores.transactions.items.value).toHaveLength(PAGE_SIZE);
    expect(t.stores.transactions.hasMore.value).toBe(true);
    await t.stores.transactions.loadMore();
    expect(t.stores.transactions.items.value).toHaveLength(PAGE_SIZE + 5);
    expect(t.stores.transactions.hasMore.value).toBe(false);
  });

  it('edits and removes transactions and provides defaults', async () => {
    await add('2024-05-02', '10');
    await t.settled();
    const [tx] = t.stores.transactions.items.value;
    await t.stores.transactions.save(
      {
        kind: 'expense',
        date: '2024-05-02',
        amount: '12',
        accountId: main,
        categoryId: 'seed:groceries',
      },
      tx.id,
    );
    await t.settled();
    expect(t.stores.transactions.items.value[0].amountMinor).toBe(1200);
    await t.stores.transactions.remove(tx.id);
    await t.settled();
    expect(t.stores.transactions.items.value).toEqual([]);
    expect(await t.stores.transactions.defaults()).toEqual({ date: '2024-05-15', accountId: main });
  });

  it('rejects invalid input with typed field errors', async () => {
    await expect(add('2024-05-02', 'abc')).rejects.toMatchObject({
      fields: { amount: 'validation.money.invalid' },
    });
  });
});
