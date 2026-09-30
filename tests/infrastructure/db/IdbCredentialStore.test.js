import { describe, expect, it } from 'vitest';
import { IdbCredentialStore } from '../../../src/infrastructure/db/IdbCredentialStore.js';
import { STORES } from '../../../src/infrastructure/db/database.js';
import { createTestDb } from '../../helpers/testDb.js';

describe('IdbCredentialStore', () => {
  it('saves, loads, and clears credentials', async () => {
    const { db } = await createTestDb();
    const credentials = new IdbCredentialStore({ db });
    expect(await credentials.load()).toBeNull();
    const creds = { url: 'https://dav', vaultPath: 'v', username: 'u', password: 'p' };
    await credentials.save(creds);
    expect(await credentials.load()).toEqual(creds);
    await credentials.clear();
    expect(await credentials.load()).toBeNull();
  });

  it('ignores corrupted stored values', async () => {
    const { db } = await createTestDb();
    await db.put(STORES.meta, { url: 1 }, 'webdavCredentials');
    expect(await new IdbCredentialStore({ db }).load()).toBeNull();
  });
});
