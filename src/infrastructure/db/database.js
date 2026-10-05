/**
 * IndexedDB schema and versioned migrations.
 *
 * Entity stores hold `StoredRecord`s (fields + `_clocks`), including tombstones. Every entity
 * write goes through ChangeRecorder; see docs/SYNC_PROTOCOL.md.
 */

import { openDB } from 'idb';

export const DB_NAME = 'finanscho';

/** @typedef {import('idb').IDBPDatabase} Db */
/** @typedef {import('idb').IDBPTransaction<unknown, string[], 'versionchange'>} UpgradeTransaction */

/** Store names. */
export const STORES = /** @type {const} */ ({
  accounts: 'accounts',
  categories: 'categories',
  transactions: 'transactions',
  budgets: 'budgets',
  automations: 'automations',
  outbox: 'outbox',
  syncCursors: 'syncCursors',
  meta: 'meta',
  settings: 'settings',
});

/** Index names on the transactions store. */
export const TX_INDEXES = /** @type {const} */ ({
  date: 'date',
  accountId: 'accountId',
  toAccountId: 'toAccountId',
  categoryId: 'categoryId',
  categoryDate: 'categoryId_date',
  dateCreated: 'date_createdAt',
});

/**
 * Ordered migrations. Migration `i` upgrades the schema from version `i` to `i + 1`. Never edit a
 * released migration; append a new one. Released migrations name stores and indexes that were
 * later removed with string literals, so they keep working after the constants are gone.
 * @type {ReadonlyArray<(db: Db, tx: UpgradeTransaction) => void>}
 */
const MIGRATIONS = [
  // v1: initial schema.
  (db) => {
    db.createObjectStore(STORES.accounts, { keyPath: 'id' });
    const categories = db.createObjectStore(STORES.categories, { keyPath: 'id' });
    categories.createIndex('kind', 'kind');

    const transactions = db.createObjectStore(STORES.transactions, { keyPath: 'id' });
    transactions.createIndex(TX_INDEXES.date, 'date');
    transactions.createIndex(TX_INDEXES.accountId, 'accountId');
    transactions.createIndex(TX_INDEXES.toAccountId, 'toAccountId');
    transactions.createIndex(TX_INDEXES.categoryId, 'categoryId');
    transactions.createIndex(TX_INDEXES.categoryDate, ['categoryId', 'date']);
    transactions.createIndex(TX_INDEXES.dateCreated, ['date', 'createdAt']);
    transactions.createIndex('recurringRuleId', 'recurringRuleId');

    const budgets = db.createObjectStore(STORES.budgets, { keyPath: 'id' });
    budgets.createIndex('month', 'month');

    db.createObjectStore('recurringRules', { keyPath: 'id' });
    db.createObjectStore(STORES.outbox, { keyPath: 'seq' });
    db.createObjectStore(STORES.syncCursors, { keyPath: 'deviceId' });
    db.createObjectStore(STORES.meta);
    db.createObjectStore(STORES.settings);
  },
  // v2: automations replace recurring rules (docs/DECISIONS.md, D50). Old rules are dropped, not
  // migrated; the never-read `recurringRuleId` index goes with them.
  (db, tx) => {
    tx.objectStore(STORES.transactions).deleteIndex('recurringRuleId');
    db.deleteObjectStore('recurringRules');
    db.createObjectStore(STORES.automations, { keyPath: 'id' });
  },
];

/** The schema version this build expects. */
export const DB_VERSION = MIGRATIONS.length;

/**
 * Opens (and migrates) the database.
 * @param {{ name?: string }} [options] database name override (tests)
 * @returns {Promise<Db>}
 */
export async function openDatabase(options = {}) {
  const db = await openDB(options.name ?? DB_NAME, DB_VERSION, {
    upgrade(database, oldVersion, _newVersion, transaction) {
      for (let version = oldVersion; version < DB_VERSION; version += 1) {
        MIGRATIONS[version](database, /** @type {UpgradeTransaction} */ (transaction));
      }
    },
    blocking() {
      // Another tab wants to upgrade: release our connection so it can proceed.
      db.close();
    },
  });
  return db;
}
