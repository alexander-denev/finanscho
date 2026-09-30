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
  if (needle && !`${tx.payee}\n${tx.note}`.toLowerCase().includes(needle)) return false;
  return true;
}

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
   * @returns {Promise<number>}
   */
  async netForAccount(accountId) {
    const store = this.#db.transaction(STORES.transactions).store;
    let total = 0;
    for (const indexName of [TX_INDEXES.accountId, TX_INDEXES.toAccountId]) {
      let cursor = await store.index(indexName).openCursor(accountId);
      while (cursor) {
        const record = /** @type {StoredRecord} */ (cursor.value);
        if (isVisible(record)) {
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
   * @param {string} ruleId
   * @returns {Promise<Set<string>>} occurrence IDs in any state, including tombstones
   */
  async occurrenceIdsForRule(ruleId) {
    const keys = await this.#db.getAllKeysFromIndex(
      STORES.transactions,
      TX_INDEXES.recurringRuleId,
      ruleId,
    );
    return new Set(keys.map(String));
  }

  /**
   * Writes recurring occurrences that do not exist locally in any state (including deleted),
   * with the rule's creation clock so identical occurrences from several devices merge
   * idempotently and any later user edit wins.
   * @param {string} ruleId
   * @param {Transaction[]} occurrences
   * @returns {Promise<number>}
   */
  async materialize(ruleId, occurrences) {
    let written = 0;
    await this.#recorder.transact(['transactions', 'recurringRules'], async (ctx) => {
      const rule = await ctx.get('recurringRules', ruleId);
      const ruleClock = rule?._clocks.createdAt;
      if (!rule || !ruleClock) return;
      for (const occurrence of occurrences) {
        if (await ctx.get('transactions', occurrence.id)) continue;
        await ctx.write({
          entity: 'transactions',
          id: occurrence.id,
          fields: fieldsOf(occurrence),
          origin: 'recurrence',
          hlc: ruleClock,
        });
        written += 1;
      }
    });
    return written;
  }
}
