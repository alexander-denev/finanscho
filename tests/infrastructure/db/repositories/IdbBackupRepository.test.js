import { describe, expect, it } from 'vitest';
import { IdbBackupRepository } from '../../../../src/infrastructure/db/repositories/IdbBackupRepository.js';
import { IdbAccountRepository } from '../../../../src/infrastructure/db/repositories/IdbAccountRepository.js';
import { IdbBudgetRepository } from '../../../../src/infrastructure/db/repositories/IdbBudgetRepository.js';
import { STORES } from '../../../../src/infrastructure/db/database.js';
import { createTestDb } from '../../../helpers/testDb.js';

const account = {
  id: 'a1',
  name: 'Wallet',
  type: /** @type {const} */ ('cash'),
  currency: 'EUR',
  openingBalanceMinor: 0,
  color: null,
  archived: false,
  createdAt: 't',
  updatedAt: 't',
  deleted: false,
};

describe('IdbBackupRepository', () => {
  it('restores an export into an empty database exactly, including tombstones', async () => {
    const source = await createTestDb();
    await new IdbAccountRepository(source).create(account);
    await new IdbAccountRepository(source).update('a1', { name: 'Cash' });
    const budgets = new IdbBudgetRepository(source);
    await budgets.put({
      id: 'c:2024-05',
      categoryId: 'c',
      month: '2024-05',
      limitMinor: 1,
      currency: 'EUR',
      createdAt: 't',
      updatedAt: 't',
      deleted: false,
    });
    await budgets.remove('c:2024-05', 'u');
    const exported = await new IdbBackupRepository(source).exportAll();

    const target = await createTestDb({ deviceId: '22222222-2222-4222-8222-222222222222' });
    const backup = new IdbBackupRepository(target);
    expect(await backup.importAll(exported)).toBe(2);
    expect(await backup.exportAll()).toEqual(exported);
    // Imported data is queued for sync.
    expect((await target.db.getAll(STORES.outbox)).length).toBeGreaterThan(0);
    // Importing again changes nothing and queues nothing.
    const outboxBefore = (await target.db.getAll(STORES.outbox)).length;
    expect(await backup.importAll(exported)).toBe(0);
    expect((await target.db.getAll(STORES.outbox)).length).toBe(outboxBefore);
  });

  it('merges into a non-empty database and skips malformed records', async () => {
    const source = await createTestDb();
    await new IdbAccountRepository(source).create(account);
    const exported = await new IdbBackupRepository(source).exportAll();

    const target = await createTestDb();
    const accounts = new IdbAccountRepository(target);
    target.clock.advance(60_000);
    await accounts.create({ ...account, name: 'Newer local name' });
    const changed = await new IdbBackupRepository(target).importAll({
      ...exported,
      accounts: [...exported.accounts, { id: 'bad', _clocks: { name: 'not-a-clock' } }],
      unknownEntity: [{ id: 'x', _clocks: {} }],
    });
    expect(changed).toBe(0);
    expect((await accounts.get('a1'))?.name).toBe('Newer local name');
    expect(await target.db.get(STORES.accounts, 'bad')).toBeUndefined();
  });
});
