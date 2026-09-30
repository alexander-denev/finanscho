import { STORES } from '../database.js';
import { byName, fieldsOf, visibleEntities, visibleEntity } from './recordMapping.js';

/** @typedef {import('../../../core/domain/account.js').Account} Account */
/** @typedef {import('../database.js').Db} Db */
/** @typedef {import('../ChangeRecorder.js').ChangeRecorder} ChangeRecorder */

/** IndexedDB implementation of the AccountRepository port. */
export class IdbAccountRepository {
  #db;
  #recorder;

  /** @param {{ db: Db, recorder: ChangeRecorder }} deps */
  constructor({ db, recorder }) {
    this.#db = db;
    this.#recorder = recorder;
  }

  /**
   * @param {{ includeArchived?: boolean }} [options]
   * @returns {Promise<Account[]>}
   */
  async list(options = {}) {
    /** @type {Account[]} */
    const accounts = visibleEntities(await this.#db.getAll(STORES.accounts));
    return accounts.filter((a) => options.includeArchived || !a.archived).sort(byName);
  }

  /**
   * @param {string} id
   * @returns {Promise<Account | null>}
   */
  async get(id) {
    return visibleEntity(await this.#db.get(STORES.accounts, id));
  }

  /**
   * @param {Account} account
   * @returns {Promise<void>}
   */
  async create(account) {
    await this.#recorder.write({ entity: 'accounts', id: account.id, fields: fieldsOf(account) });
  }

  /**
   * @param {string} id
   * @param {Partial<Account>} changes
   * @returns {Promise<void>}
   */
  async update(id, changes) {
    await this.#recorder.write({ entity: 'accounts', id, fields: fieldsOf(changes) });
  }
}
