import { describe, expect, it } from 'vitest';
import { BackupError } from '../../../src/core/errors.js';
import { createTestServices, makeAccount } from '../../helpers/testServices.js';

describe('BackupService', () => {
  it('exports everything and restores it exactly into an empty database', async () => {
    const source = await createTestServices();
    await source.services.categories.seedDefaults();
    const account = await makeAccount(source, 'Main', '10');
    const tx = await source.services.transactions.create({
      kind: 'expense',
      date: '2024-05-02',
      amount: '3',
      accountId: account.id,
      categoryId: 'seed:groceries',
    });
    await source.services.transactions.remove(tx.id);
    const json = await source.services.backup.exportJson();
    const parsed = JSON.parse(json);
    expect(parsed).toMatchObject({ kind: 'finanscho-backup', format: 1 });
    expect(parsed.entities.transactions[0]).toMatchObject({ id: tx.id, deleted: true });
    expect(parsed.entities.transactions[0]._clocks.deleted).toBeTruthy();
    expect(source.services.backup.fileName()).toBe('finanscho-backup-2024-05-15.json');

    const target = await createTestServices({ deviceId: '33333333-3333-4333-8333-333333333333' });
    expect(await target.services.backup.importJson(json)).toBeGreaterThan(0);
    const roundTrip = JSON.parse(await target.services.backup.exportJson());
    expect(roundTrip.entities).toEqual(parsed.entities);
  });

  it.each([
    ['not json', 'backupInvalid'],
    ['{"kind":"other","format":1,"entities":{}}', 'backupInvalid'],
    ['{"kind":"finanscho-backup","format":1,"entities":{"accounts":{}}}', 'backupInvalid'],
    ['{"kind":"finanscho-backup","format":2,"entities":{}}', 'backupFormatTooNew'],
  ])('rejects %s', async (text, code) => {
    const t = await createTestServices();
    const error = await t.services.backup.importJson(text).catch((e) => e);
    expect(error).toBeInstanceOf(BackupError);
    expect(error.code).toBe(code);
  });
});
