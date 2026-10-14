import { describe, expect, it } from 'vitest';
import { STORES } from '../../../../src/infrastructure/db/database.js';
import { IdbBackupRepository } from '../../../../src/infrastructure/db/repositories/IdbBackupRepository.js';
import { IdbToPayRepository } from '../../../../src/infrastructure/db/repositories/IdbToPayRepository.js';
import { IdbTransactionRepository } from '../../../../src/infrastructure/db/repositories/IdbTransactionRepository.js';
import { createTestDb } from '../../../helpers/testDb.js';

/** @typedef {import('../../../../src/core/domain/toPay.js').ToPay} ToPay */

/**
 * @param {Partial<ToPay>} [over]
 * @returns {ToPay}
 */
const toPay = (over = {}) => ({
  id: 'tp1',
  kind: 'expense',
  amountMinor: 80000,
  accountId: 'a1',
  toAccountId: null,
  categoryId: 'c1',
  payee: 'Rent',
  note: 'June',
  dueDate: '2024-06-01',
  automationId: null,
  createdAt: '2024-05-01T10:00:00.000Z',
  updatedAt: '2024-05-01T10:00:00.000Z',
  deleted: false,
  ...over,
});

describe('IdbToPayRepository', () => {
  it('creates, edits, lists, and deletes To pays', async () => {
    const repo = new IdbToPayRepository(await createTestDb());
    await repo.create(toPay());
    await repo.create(toPay({ id: 'tp2', payee: 'Gym', dueDate: null }));
    await repo.update('tp1', { amountMinor: 85000, updatedAt: 'u' });
    expect((await repo.get('tp1'))?.amountMinor).toBe(85000);
    expect((await repo.list()).map((item) => item.id).sort()).toEqual(['tp1', 'tp2']);
    await repo.remove('tp2', 'u');
    expect(await repo.get('tp2')).toBeNull();
    expect((await repo.list()).map((item) => item.id)).toEqual(['tp1']);
  });

  it('pays: records the transaction it holds, dated today, and deletes the To pay together', async () => {
    const env = await createTestDb();
    const repo = new IdbToPayRepository(env);
    const transactions = new IdbTransactionRepository(env);
    await repo.create(toPay({ automationId: 'auto-1' }));
    /** @type {string[][]} */
    const events = [];
    env.feed.subscribe((event) => events.push(event.entities));

    const payment = await repo.pay('tp1', '2024-06-03', '2024-06-03T08:00:00.000Z');
    expect(payment?.id).toBe('paid:tp1');
    expect(await transactions.get('paid:tp1')).toMatchObject({
      kind: 'expense',
      date: '2024-06-03',
      amountMinor: 80000,
      accountId: 'a1',
      categoryId: 'c1',
      payee: 'Rent',
      note: 'June',
      automationId: null,
    });
    expect(await repo.get('tp1')).toBeNull();
    expect(events).toEqual([['transactions', 'toPays']]);

    // Paying a To pay that is gone does nothing.
    expect(await repo.pay('tp1', '2024-06-04', '2024-06-04T08:00:00.000Z')).toBeNull();
    expect((await transactions.get('paid:tp1'))?.date).toBe('2024-06-03');
  });

  it('tells whether an account or category is in use, ignoring deleted To pays', async () => {
    const repo = new IdbToPayRepository(await createTestDb());
    await repo.create(
      toPay({ kind: 'transfer', accountId: 'a1', toAccountId: 'a2', categoryId: null }),
    );
    await repo.create(toPay({ id: 'tp2', accountId: 'a3', categoryId: 'c2' }));
    expect(await repo.hasAnyForAccount('a1')).toBe(true);
    expect(await repo.hasAnyForAccount('a2')).toBe(true);
    expect(await repo.hasAnyForCategory('c2')).toBe(true);
    expect(await repo.hasAnyForCategory('c1')).toBe(false);
    await repo.remove('tp2', 'u');
    expect(await repo.hasAnyForAccount('a3')).toBe(false);
    expect(await repo.hasAnyForCategory('c2')).toBe(false);
  });

  it('finds IDs by prefix in any state', async () => {
    const repo = new IdbToPayRepository(await createTestDb());
    await repo.create(toPay({ id: 'auto-1:t0:a0:2024-06-01' }));
    await repo.create(toPay({ id: 'auto-1:t0:a0:2024-07-01' }));
    await repo.create(toPay({ id: 'auto-2:t0:a0:2024-06-01' }));
    await repo.remove('auto-1:t0:a0:2024-07-01', 'u');
    expect([...(await repo.idsWithPrefix('auto-1:'))].sort()).toEqual([
      'auto-1:t0:a0:2024-06-01',
      'auto-1:t0:a0:2024-07-01',
    ]);
  });

  it('is exported and restored by backups', async () => {
    const source = await createTestDb();
    await new IdbToPayRepository(source).create(toPay());
    const exported = await new IdbBackupRepository(source).exportAll();
    expect(exported.toPays).toHaveLength(1);

    const target = await createTestDb({ deviceId: '22222222-2222-4222-8222-222222222222' });
    expect(await new IdbBackupRepository(target).importAll(exported)).toBe(1);
    expect(await new IdbToPayRepository(target).get('tp1')).toMatchObject({ payee: 'Rent' });
    expect((await target.db.getAll(STORES.outbox)).length).toBeGreaterThan(0);
  });
});
