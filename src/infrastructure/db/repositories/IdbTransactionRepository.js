import { firstDayOfMonth, lastDayOfMonth } from '../../../core/domain/localDate.js';
import { balanceEffect } from '../../../core/domain/transaction.js';
import { isVisible } from '../../sync/merge.js';
import { STORES, TX_INDEXES } from '../database.js';
import { fieldsOf, toEntity, visibleEntity } from './recordMapping.js';

/** @typedef {import('../../../core/domain/transaction.js').Transaction} Transaction */
/** @typedef {import('../../../core/ports/repositories.js').TransactionQuery} TransactionQuery */
/** @typedef {import('../../sync/merge.js').StoredRecord} StoredRecord */
/** @typedef {import('../database.js').Db} Db */
/** @typedef {import('../ChangeRecorder.js').ChangeRecorder} ChangeRecorder */

/**
 * Key range over the `[date, createdAt]` index covering whole days `from`..`to`. Arrays sort
 * after strings in IndexedDB, so `[to, []]` is above every `[to, <string>]`.
 * @param {string} from
 * @param {string} to
 * @returns {IDBKeyRange}
 */
function dayRange(from, to) {
  return IDBKeyRange.bound([from], [to, []]);
}

/**
 * Key range over every ID that starts with `prefix`.
 * @param {string} prefix
 * @returns {IDBKeyRange}
 */
function prefixRange(prefix) {
  return IDBKeyRange.bound(prefix, `${prefix}￿`);
}

/**
 * @param {Transaction} tx
 * @param {TransactionQuery} query
 * @param {string} needle lower-cased search text
 * @returns {boolean}
 */
function matches(tx, query, needle) {
  if (query.accountId && tx.accountId !== query.accountId && tx.toAccountId !== query.accountId) {
    return false;
  }
  if (query.categoryId && tx.categoryId !== query.categoryId) return false;
  // Balance adjustments have no category on purpose; they are not waiting to be categorized.
  if (query.uncategorized && (tx.kind === 'transfer' || tx.categoryId || tx.adjustment)) {
    return false;
  }
  if (needle && !`${tx.payee}\n${tx.note}`.toLowerCase().includes(needle)) return false;
  return true;
}

/** How many recent transactions `recentPayees` reads at most, so suggestions stay cheap. */
export const PAYEE_SCAN_LIMIT = 2000;

/** IndexedDB implementation of the TransactionRepository port. */
export class IdbTransactionRepository {
  #db;
  #recorder;

  /** @param {{ db: Db, recorder: ChangeRecorder }} deps */
  constructor({ db, recorder }) {
    this.#db = db;
    this.#recorder = recorder;
  }

  /**
   * @param {string} id
   * @returns {Promise<Transaction | null>}
   */
  async get(id) {
    return visibleEntity(await this.#db.get(STORES.transactions, id));
  }

  /**
   * Walks the `[date, createdAt]` index newest first (bounded to the month when given), filtering
   * in the cursor and stopping after `limit + 1` matches, so memory stays bounded.
   * @param {TransactionQuery} query
   * @returns {Promise<{ items: Transaction[], hasMore: boolean }>}
   */
  async query(query) {
    const range = query.month
      ? dayRange(firstDayOfMonth(query.month), lastDayOfMonth(query.month))
      : undefined;
    const needle = (query.search ?? '').trim().toLowerCase();
    /** @type {Transaction[]} */
    const items = [];
    const index = this.#db.transaction(STORES.transactions).store.index(TX_INDEXES.dateCreated);
    let cursor = await index.openCursor(range, 'prev');
    while (cursor && items.length <= query.limit) {
      const record = /** @type {StoredRecord} */ (cursor.value);
      if (isVisible(record)) {
        /** @type {Transaction} */
        const tx = toEntity(record);
        if (matches(tx, query, needle)) items.push(tx);
      }
      cursor = await cursor.continue();
    }
    const hasMore = items.length > query.limit;
    return { items: hasMore ? items.slice(0, query.limit) : items, hasMore };
  }

  /**
   * @param {string} from
   * @param {string} to
   * @returns {Promise<Transaction[]>}
   */
  async listInRange(from, to) {
    const records = await this.#db.getAllFromIndex(
      STORES.transactions,
      TX_INDEXES.dateCreated,
      dayRange(from, to),
    );
    return /** @type {StoredRecord[]} */ (records).filter(isVisible).map((r) => toEntity(r));
  }

  /**
   * @param {string} categoryId
   * @param {string} month
   * @returns {Promise<Transaction[]>}
   */
  async listForCategoryInMonth(categoryId, month) {
    const range = IDBKeyRange.bound(
      [categoryId, firstDayOfMonth(month)],
      [categoryId, lastDayOfMonth(month)],
    );
    const records = await this.#db.getAllFromIndex(
      STORES.transactions,
      TX_INDEXES.categoryDate,
      range,
    );
    return /** @type {StoredRecord[]} */ (records).filter(isVisible).map((r) => toEntity(r));
  }

  /**
   * Signed sum of every visible transaction's effect on the account, streamed through the
   * `accountId` and `toAccountId` indexes without loading the full history.
   * @param {string} accountId
   * @param {string} [through] only transactions dated on or before this day
   * @returns {Promise<number>}
   */
  async netForAccount(accountId, through) {
    const store = this.#db.transaction(STORES.transactions).store;
    let total = 0;
    for (const indexName of [TX_INDEXES.accountId, TX_INDEXES.toAccountId]) {
      let cursor = await store.index(indexName).openCursor(accountId);
      while (cursor) {
        const record = /** @type {StoredRecord} */ (cursor.value);
        if (isVisible(record) && (through === undefined || String(record.date) <= through)) {
          const tx = /** @type {Transaction} */ (toEntity(record));
          // A transfer appears in both indexes: the source side here, the destination side there.
          if (indexName === TX_INDEXES.accountId) {
            total += balanceEffect({ ...tx, toAccountId: null }, accountId);
          } else if (tx.kind === 'transfer') {
            total += tx.amountMinor;
          }
        }
        cursor = await cursor.continue();
      }
    }
    if (!Number.isSafeInteger(total)) throw new RangeError('Balance exceeds safe integer range');
    return total;
  }

  /**
   * @param {string} accountId
   * @returns {Promise<boolean>}
   */
  async hasAnyForAccount(accountId) {
    const store = this.#db.transaction(STORES.transactions).store;
    for (const indexName of [TX_INDEXES.accountId, TX_INDEXES.toAccountId]) {
      let cursor = await store.index(indexName).openCursor(accountId);
      while (cursor) {
        if (isVisible(/** @type {StoredRecord} */ (cursor.value))) return true;
        cursor = await cursor.continue();
      }
    }
    return false;
  }

  /**
   * @param {string} categoryId
   * @returns {Promise<boolean>}
   */
  async hasAnyForCategory(categoryId) {
    const index = this.#db.transaction(STORES.transactions).store.index(TX_INDEXES.categoryId);
    let cursor = await index.openCursor(categoryId);
    while (cursor) {
      if (isVisible(/** @type {StoredRecord} */ (cursor.value))) return true;
      cursor = await cursor.continue();
    }
    return false;
  }

  /**
   * Walks the `[date, createdAt]` index newest first, reading at most PAYEE_SCAN_LIMIT records.
   * @param {number} limit maximum number of distinct payees
   * @returns {Promise<import('../../../core/ports/repositories.js').PayeeSuggestion[]>}
   */
  async recentPayees(limit) {
    /** @type {Map<string, import('../../../core/ports/repositories.js').PayeeSuggestion>} */
    const byKey = new Map();
    const index = this.#db.transaction(STORES.transactions).store.index(TX_INDEXES.dateCreated);
    let cursor = await index.openCursor(null, 'prev');
    for (let read = 0; cursor && read < PAYEE_SCAN_LIMIT && byKey.size < limit; read += 1) {
      const record = /** @type {StoredRecord} */ (cursor.value);
      if (isVisible(record)) {
        /** @type {Transaction} */
        const tx = toEntity(record);
        const key = tx.payee.trim().toLocaleLowerCase();
        if (key && !byKey.has(key)) {
          byKey.set(key, {
            payee: tx.payee,
            kind: tx.kind,
            categoryId: tx.categoryId,
            accountId: tx.accountId,
          });
        }
      }
      cursor = await cursor.continue();
    }
    return [...byKey.values()];
  }

  /**
   * @param {Transaction} transaction
   * @returns {Promise<void>}
   */
  async create(transaction) {
    await this.#recorder.write({
      entity: 'transactions',
      id: transaction.id,
      fields: fieldsOf(transaction),
    });
  }

  /**
   * @param {string} id
   * @param {Partial<Transaction>} changes
   * @returns {Promise<void>}
   */
  async update(id, changes) {
    await this.#recorder.write({ entity: 'transactions', id, fields: fieldsOf(changes) });
  }

  /**
   * @param {string} id
   * @param {string} updatedAt
   * @returns {Promise<void>}
   */
  async remove(id, updatedAt) {
    await this.#recorder.write({
      entity: 'transactions',
      id,
      fields: { deleted: true, updatedAt },
    });
  }

  /**
   * Reads primary keys, not an index: tombstone stubs keep only their ID (D40), and the IDs of an
   * automation's results all start with its prefix.
   * @param {string} prefix
   * @returns {Promise<Set<string>>} IDs in any state, including tombstones and stubs
   */
  async idsWithPrefix(prefix) {
    const keys = await this.#db.getAllKeys(STORES.transactions, prefixRange(prefix));
    return new Set(keys.map(String));
  }

  /**
   * @param {string} prefix
   * @returns {Promise<Transaction[]>} visible transactions whose ID starts with `prefix`
   */
  async listWithPrefix(prefix) {
    const records = await this.#db.getAll(STORES.transactions, prefixRange(prefix));
    return /** @type {StoredRecord[]} */ (records).filter(isVisible).map((r) => toEntity(r));
  }
}
