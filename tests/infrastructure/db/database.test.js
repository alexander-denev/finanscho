import { openDB } from 'idb';
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

  it('upgrades a v1 database: drops recurring rules and keeps everything else', async () => {
    const name = 'upgrade-test';
    // The v1 schema as released, written out so the test doesn't depend on the migration code.
    const v1 = await openDB(name, 1, {
      upgrade(db) {
        db.createObjectStore('accounts', { keyPath: 'id' });
        db.createObjectStore('categories', { keyPath: 'id' }).createIndex('kind', 'kind');
        const transactions = db.createObjectStore('transactions', { keyPath: 'id' });
        transactions.createIndex('date', 'date');
        transactions.createIndex('accountId', 'accountId');
        transactions.createIndex('toAccountId', 'toAccountId');
        transactions.createIndex('categoryId', 'categoryId');
        transactions.createIndex('categoryId_date', ['categoryId', 'date']);
        transactions.createIndex('date_createdAt', ['date', 'createdAt']);
        transactions.createIndex('recurringRuleId', 'recurringRuleId');
        db.createObjectStore('budgets', { keyPath: 'id' }).createIndex('month', 'month');
        db.createObjectStore('recurringRules', { keyPath: 'id' });
        db.createObjectStore('outbox', { keyPath: 'seq' });
        db.createObjectStore('syncCursors', { keyPath: 'deviceId' });
        db.createObjectStore('meta');
        db.createObjectStore('settings');
      },
    });
    await v1.put('recurringRules', { id: 'r1', _clocks: {} });
    await v1.put('transactions', { id: 'r1:2024-01-01', recurringRuleId: 'r1', _clocks: {} });
    v1.close();

    const db = await openDatabase({ name });
    expect([...db.objectStoreNames].sort()).toEqual(Object.values(STORES).sort());
    const tx = db.transaction(STORES.transactions);
    expect([...tx.store.indexNames].sort()).toEqual(Object.values(TX_INDEXES).sort());
    expect(await db.get(STORES.transactions, 'r1:2024-01-01')).toMatchObject({
      recurringRuleId: 'r1',
    });
    db.close();
  });
});
