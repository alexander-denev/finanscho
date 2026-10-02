import { beforeEach, describe, expect, it } from 'vitest';
import { STORES } from '../../../src/infrastructure/db/database.js';
import { createTestServices, makeAccount } from '../../helpers/testServices.js';
import { asyncFieldErrors } from '../../helpers/fieldErrors.js';

describe('TransactionService', () => {
  /** @type {Awaited<ReturnType<typeof createTestServices>>} */
  let t;
  /** @type {import('../../../src/core/domain/account.js').Account} */
  let main;

  beforeEach(async () => {
    t = await createTestServices();
    await t.services.categories.seedDefaults();
    main = await makeAccount(t, 'Main');
  });

  it('creates a validated transaction and remembers the account', async () => {
    const other = await makeAccount(t, 'Other');
    const created = await t.services.transactions.create({
      kind: 'expense',
      date: '2024-05-02',
      amount: '12,34',
      accountId: other.id,
      categoryId: 'seed:groceries',
      payee: 'Market',
    });
    expect(created).toMatchObject({ amountMinor: 1234, accountId: other.id, payee: 'Market' });
    expect(await t.services.transactions.defaults()).toEqual({
      date: '2024-05-15',
      accountId: other.id,
    });
  });

  it('records uncategorized income and expenses and filters them', async () => {
    await t.services.transactions.create({
      kind: 'expense',
      date: '2024-05-02',
      amount: '3',
      accountId: main.id,
    });
    await t.services.transactions.create({
      kind: 'income',
      date: '2024-05-03',
      amount: '4',
      accountId: main.id,
      categoryId: '',
    });
    await t.services.transactions.create({
      kind: 'expense',
      date: '2024-05-04',
      amount: '5',
      accountId: main.id,
      categoryId: 'seed:groceries',
    });
    const other = await makeAccount(t, 'Other');
    await t.services.transactions.create({
      kind: 'transfer',
      date: '2024-05-05',
      amount: '6',
      accountId: main.id,
      toAccountId: other.id,
    });
    const { items } = await t.services.transactions.query({ limit: 10, uncategorized: true });
    expect(items.map((tx) => [tx.amountMinor, tx.categoryId])).toEqual([
      [400, null],
      [300, null],
    ]);
  });

  it('suggests each payee once, most recent first, with its latest kind, category, and account', async () => {
    const other = await makeAccount(t, 'Other');
    /**
     * @param {string} date
     * @param {string} payee
     * @param {Partial<import('../../../src/core/domain/transaction.js').TransactionInput>} [over]
     */
    const add = (date, payee, over = {}) =>
      t.services.transactions.create({
        kind: 'expense',
        date,
        amount: '1',
        accountId: main.id,
        categoryId: 'seed:groceries',
        payee,
        ...over,
      });
    await add('2024-05-01', 'Lidl', { categoryId: 'seed:dining' });
    await add('2024-05-02', 'Bakery');
    await add('2024-05-03', '  ');
    await add('2024-05-04', 'lidl', { accountId: other.id });
    expect(await t.services.transactions.payeeSuggestions()).toEqual([
      { payee: 'lidl', kind: 'expense', categoryId: 'seed:groceries', accountId: other.id },
      { payee: 'Bakery', kind: 'expense', categoryId: 'seed:groceries', accountId: main.id },
    ]);
  });

  it('rejects references to missing accounts and wrong category kinds', async () => {
    expect(
      await asyncFieldErrors(
        t.services.transactions.create({
          kind: 'income',
          date: '2024-05-02',
          amount: '1',
          accountId: 'missing',
          categoryId: 'seed:groceries',
        }),
      ),
    ).toEqual({ accountId: 'validation.required', categoryId: 'validation.categoryKind' });
  });

  it('writes only changed fields on update', async () => {
    const created = await t.services.transactions.create({
      kind: 'expense',
      date: '2024-05-02',
      amount: '5',
      accountId: main.id,
      categoryId: 'seed:groceries',
      note: 'milk',
    });
    t.clock.advance(1000);
    await t.services.transactions.update(created.id, {
      kind: 'expense',
      date: '2024-05-02',
      amount: '5',
      accountId: main.id,
      categoryId: 'seed:groceries',
      note: 'milk and eggs',
    });
    const outbox = await t.db.getAll(STORES.outbox);
    const last = outbox[outbox.length - 1];
    expect(Object.keys(last.fields).sort()).toEqual(['note', 'updatedAt']);
    expect((await t.services.transactions.get(created.id)).note).toBe('milk and eggs');

    const before = (await t.db.getAll(STORES.outbox)).length;
    await t.services.transactions.update(created.id, {
      kind: 'expense',
      date: '2024-05-02',
      amount: '5.00',
      accountId: main.id,
      categoryId: 'seed:groceries',
      note: 'milk and eggs',
    });
    expect((await t.db.getAll(STORES.outbox)).length).toBe(before);
  });

  it('deletes and queries transactions', async () => {
    const a = await t.services.transactions.create({
      kind: 'expense',
      date: '2024-05-02',
      amount: '5',
      accountId: main.id,
      categoryId: 'seed:groceries',
    });
    await t.services.transactions.create({
      kind: 'expense',
      date: '2024-05-03',
      amount: '6',
      accountId: main.id,
      categoryId: 'seed:dining',
    });
    await t.services.transactions.remove(a.id);
    const { items } = await t.services.transactions.query({ limit: 10 });
    expect(items.map((i) => i.amountMinor)).toEqual([600]);
    await expect(t.services.transactions.remove(a.id)).rejects.toThrow('not found');
  });

  it('defaults to the first active account when the last one is archived', async () => {
    const other = await makeAccount(t, 'Zeta');
    await t.services.transactions.create({
      kind: 'expense',
      date: '2024-05-02',
      amount: '5',
      accountId: other.id,
      categoryId: 'seed:groceries',
    });
    await t.services.accounts.setArchived(other.id, true);
    expect((await t.services.transactions.defaults()).accountId).toBe(main.id);
  });
});
