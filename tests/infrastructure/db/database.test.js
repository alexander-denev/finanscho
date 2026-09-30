import { describe, expect, it } from 'vitest';
import {
  DB_VERSION,
  openDatabase,
  STORES,
  TX_INDEXES,
} from '../../../src/infrastructure/db/database.js';

describe('database', () => {
  it('creates every store and transaction index', async () => {
    const db = await openDatabase({ name: 'schema-test' });
    expect(db.version).toBe(DB_VERSION);
    expect([...db.objectStoreNames].sort()).toEqual(Object.values(STORES).sort());
    const tx = db.transaction(STORES.transactions);
    expect([...tx.store.indexNames].sort()).toEqual(Object.values(TX_INDEXES).sort());
    expect(tx.store.index(TX_INDEXES.categoryDate).keyPath).toEqual(['categoryId', 'date']);
    expect([...db.transaction(STORES.budgets).store.indexNames]).toEqual(['month']);
    db.close();
  });

  it('reopens an existing database without re-running migrations', async () => {
    const first = await openDatabase({ name: 'reopen-test' });
    await first.put(STORES.settings, 'dark', 'theme');
    first.close();
    const second = await openDatabase({ name: 'reopen-test' });
    expect(await second.get(STORES.settings, 'theme')).toBe('dark');
    second.close();
  });
});
