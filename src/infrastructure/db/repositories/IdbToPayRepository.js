import { paymentFor } from '../../../core/domain/toPay.js';
import { isVisible } from '../../sync/merge.js';
import { STORES, TO_PAY_INDEXES } from '../database.js';
import {
  fieldsOf,
  prefixRange,
  toEntity,
  visibleEntities,
  visibleEntity,
} from './recordMapping.js';

/** @typedef {import('../../../core/domain/toPay.js').ToPay} ToPay */
/** @typedef {import('../../../core/domain/transaction.js').Transaction} Transaction */
/** @typedef {import('../../sync/merge.js').StoredRecord} StoredRecord */
/** @typedef {import('../database.js').Db} Db */
/** @typedef {import('../ChangeRecorder.js').ChangeRecorder} ChangeRecorder */

/** IndexedDB implementation of the ToPayRepository port. */
export class IdbToPayRepository {
  #db;
  #recorder;

  /** @param {{ db: Db, recorder: ChangeRecorder }} deps */
  constructor({ db, recorder }) {
    this.#db = db;
    this.#recorder = recorder;
  }

  /** @returns {Promise<ToPay[]>} */
  async list() {
    return visibleEntities(await this.#db.getAll(STORES.toPays));
  }

  /**
   * @param {string} id
   * @returns {Promise<ToPay | null>}
   */
  async get(id) {
    return visibleEntity(await this.#db.get(STORES.toPays, id));
  }

  /**
   * @param {ToPay} toPay
   * @returns {Promise<void>}
   */
  async create(toPay) {
    await this.#recorder.write({ entity: 'toPays', id: toPay.id, fields: fieldsOf(toPay) });
  }

  /**
   * @param {string} id
   * @param {Partial<ToPay>} changes
   * @returns {Promise<void>}
   */
  async update(id, changes) {
    await this.#recorder.write({ entity: 'toPays', id, fields: fieldsOf(changes) });
  }

  /**
   * @param {string} id
   * @param {string} updatedAt
   * @returns {Promise<void>}
   */
  async remove(id, updatedAt) {
    await this.#recorder.write({ entity: 'toPays', id, fields: { deleted: true, updatedAt } });
  }

  /**
   * Records the To pay's payment and deletes the To pay in one transaction, so neither happens
   * without the other. The payment is built from the To pay as stored at that moment. Every field
   * of the payment is written, so paying again a To pay that came back after its payment was
   * deleted restores the payment in full.
   * @param {string} id
   * @param {string} today
   * @param {string} now ISO 8601 UTC
   * @returns {Promise<Transaction | null>} the payment, or null when the To pay is gone
   */
  async pay(id, today, now) {
    /** @type {Transaction | null} */
    let payment = null;
    await this.#recorder.transact(['toPays', 'transactions'], async (ctx) => {
      const stored = await ctx.get('toPays', id);
      if (!stored || !isVisible(stored)) return;
      payment = paymentFor(toEntity(stored), today, now);
      await ctx.write({ entity: 'transactions', id: payment.id, fields: fieldsOf(payment) });
      await ctx.write({ entity: 'toPays', id, fields: { deleted: true, updatedAt: now } });
    });
    return payment;
  }

  /**
   * @param {string} accountId
   * @returns {Promise<boolean>}
   */
  async hasAnyForAccount(accountId) {
    const store = this.#db.transaction(STORES.toPays).store;
    for (const indexName of [TO_PAY_INDEXES.accountId, TO_PAY_INDEXES.toAccountId]) {
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
    const index = this.#db.transaction(STORES.toPays).store.index(TO_PAY_INDEXES.categoryId);
    let cursor = await index.openCursor(categoryId);
    while (cursor) {
      if (isVisible(/** @type {StoredRecord} */ (cursor.value))) return true;
      cursor = await cursor.continue();
    }
    return false;
  }

  /**
   * Reads primary keys, not an index: tombstone stubs keep only their ID (D40), and the IDs of
   * what an automation made all start with its prefix.
   * @param {string} prefix
   * @returns {Promise<Set<string>>} IDs in any state, including tombstones and stubs
   */
  async idsWithPrefix(prefix) {
    const keys = await this.#db.getAllKeys(STORES.toPays, prefixRange(prefix));
    return new Set(keys.map(String));
  }
}
