import { beforeEach, describe, expect, it } from 'vitest';
import { IdbTransactionRepository } from '../../../../src/infrastructure/db/repositories/IdbTransactionRepository.js';
import { STORES } from '../../../../src/infrastructure/db/database.js';
import { createTestDb } from '../../../helpers/testDb.js';

/** @typedef {import('../../../../src/core/domain/transaction.js').Transaction} Transaction */

/**
 * @param {Partial<Transaction> & { id: string }} over
 * @returns {Transaction}
 */
function tx(over) {
  return {
    kind: 'expense',
    date: '2024-05-10',
    amountMinor: 100,
    accountId: 'a1',
    toAccountId: null,
    categoryId: 'c1',
    payee: '',
    note: '',
    automationId: null,
    createdAt: '2024-05-10T08:00:00.000Z',
    updatedAt: '2024-05-10T08:00:00.000Z',
    deleted: false,
    ...over,
  };
}

describe('IdbTransactionRepository', () => {
  /** @type {IdbTransactionRepository} */
  let repo;
  /** @type {Awaited<ReturnType<typeof createTestDb>>} */
  let env;

  beforeEach(async () => {
    env = await createTestDb();
    repo = new IdbTransactionRepository({ db: env.db, recorder: env.recorder });
  });

  it('creates, reads, updates, and deletes (as a hidden tombstone)', async () => {
    await repo.create(tx({ id: 't1', payee: 'Shop' }));
    expect((await repo.get('t1'))?.payee).toBe('Shop');
    await repo.update('t1', { payee: 'Market', updatedAt: 'u' });
    expect((await repo.get('t1'))?.payee).toBe('Market');
    await repo.remove('t1', 'u2');
    expect(await repo.get('t1')).toBeNull();
    expect((await env.db.get(STORES.transactions, 't1')).deleted).toBe(true);
    expect((await repo.query({ limit: 10 })).items).toEqual([]);
  });

  it('queries newest first with filters and paging', async () => {
    await repo.create(tx({ id: 'old', date: '2024-04-30', payee: 'Bakery' }));
    await repo.create(
      tx({ id: 'a', date: '2024-05-02', createdAt: '2024-05-02T09:00:00Z', note: 'bread' }),
    );
    await repo.create(
      tx({ id: 'b', date: '2024-05-02', createdAt: '2024-05-02T10:00:00Z', accountId: 'a2' }),
    );
    await repo.create(tx({ id: 'c', date: '2024-05-20', categoryId: 'c2' }));
    await repo.create(
      tx({
        id: 'xfer',
        kind: 'transfer',
        date: '2024-05-05',
        accountId: 'a3',
        toAccountId: 'a2',
        categoryId: null,
      }),
    );

    const ids = async (
      /** @type {import('../../../../src/core/ports/repositories.js').TransactionQuery} */ q,
    ) => (await repo.query(q)).items.map((t) => t.id);

    expect(await ids({ limit: 10 })).toEqual(['c', 'xfer', 'b', 'a', 'old']);
    expect(await ids({ limit: 10, month: '2024-05' })).toEqual(['c', 'xfer', 'b', 'a']);
    expect(await ids({ limit: 10, accountId: 'a2' })).toEqual(['xfer', 'b']);
    expect(await ids({ limit: 10, categoryId: 'c2' })).toEqual(['c']);
    expect(await ids({ limit: 10, search: 'BREAD' })).toEqual(['a']);
    expect(await ids({ limit: 10, search: 'bakery' })).toEqual(['old']);

    const page = await repo.query({ limit: 2 });
    expect(page.items.map((t) => t.id)).toEqual(['c', 'xfer']);
    expect(page.hasMore).toBe(true);
    expect((await repo.query({ limit: 5 })).hasMore).toBe(false);
  });

  it('lists a bounded date range and a category month', async () => {
    await repo.create(tx({ id: 'apr', date: '2024-04-30' }));
    await repo.create(tx({ id: 'may1', date: '2024-05-01' }));
    await repo.create(tx({ id: 'may31', date: '2024-05-31', categoryId: 'c2' }));
    await repo.create(tx({ id: 'jun', date: '2024-06-01' }));
    const range = await repo.listInRange('2024-05-01', '2024-05-31');
    expect(range.map((t) => t.id).sort()).toEqual(['may1', 'may31']);
    const cat = await repo.listForCategoryInMonth('c1', '2024-05');
    expect(cat.map((t) => t.id)).toEqual(['may1']);
  });

  it('computes an account net from indexes, counting transfers on both sides', async () => {
    await repo.create(tx({ id: 'inc', kind: 'income', amountMinor: 10_000 }));
    await repo.create(tx({ id: 'exp', amountMinor: 2_500 }));
    await repo.create(
      tx({ id: 'out', kind: 'transfer', amountMinor: 1_000, toAccountId: 'a2', categoryId: null }),
    );
    await repo.create(
      tx({
        id: 'in',
        kind: 'transfer',
        amountMinor: 300,
        accountId: 'a2',
        toAccountId: 'a1',
        categoryId: null,
      }),
    );
    await repo.create(tx({ id: 'gone', amountMinor: 99_999 }));
    await repo.remove('gone', 'u');
    expect(await repo.netForAccount('a1')).toBe(10_000 - 2_500 - 1_000 + 300);
    expect(await repo.netForAccount('a2')).toBe(1_000 - 300);
    expect(await repo.netForAccount('none')).toBe(0);
  });

  it('limits an account net to transactions dated on or before a day', async () => {
    await repo.create(tx({ id: 'past', kind: 'income', date: '2024-05-14', amountMinor: 500 }));
    await repo.create(tx({ id: 'today', date: '2024-05-15', amountMinor: 100 }));
    await repo.create(tx({ id: 'future', date: '2024-05-16', amountMinor: 50 }));
    await repo.create(
      tx({
        id: 'futureIn',
        kind: 'transfer',
        date: '2024-05-20',
        amountMinor: 7,
        accountId: 'a2',
        toAccountId: 'a1',
        categoryId: null,
      }),
    );
    expect(await repo.netForAccount('a1', '2024-05-15')).toBe(400);
    expect(await repo.netForAccount('a1')).toBe(400 - 50 + 7);
  });

  it('leaves balance adjustments out of the uncategorized filter', async () => {
    await repo.create(tx({ id: 'open', categoryId: null }));
    await repo.create(tx({ id: 'adjust', categoryId: null, adjustment: true }));
    const { items } = await repo.query({ limit: 10, uncategorized: true });
    expect(items.map((t) => t.id)).toEqual(['open']);
  });

  it('finds IDs by prefix in any state, and lists the visible ones', async () => {
    await repo.create(tx({ id: 'auto1:a0:x' }));
    await repo.create(tx({ id: 'auto1:t0:a0:2024-05-01' }));
    await repo.create(tx({ id: 'auto10:a0:x' }));
    await repo.create(tx({ id: 'other' }));
    await repo.remove('auto1:a0:x', 'u');
    expect(await repo.idsWithPrefix('auto1:')).toEqual(
      new Set(['auto1:a0:x', 'auto1:t0:a0:2024-05-01']),
    );
    expect((await repo.listWithPrefix('auto1:')).map((t) => t.id)).toEqual([
      'auto1:t0:a0:2024-05-01',
    ]);
  });
});
