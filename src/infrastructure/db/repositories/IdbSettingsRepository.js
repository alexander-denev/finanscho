import { STORES } from '../database.js';

/** @typedef {import('../database.js').Db} Db */

/**
 * Device-local settings (not synced), stored as key-value pairs. Settings are not entities, so
 * they bypass ChangeRecorder by design.
 */
export class IdbSettingsRepository {
  #db;

  /** @param {{ db: Db }} deps */
  constructor({ db }) {
    this.#db = db;
  }

  /**
   * @param {string} key
   * @returns {Promise<unknown>}
   */
  async get(key) {
    return this.#db.get(STORES.settings, key);
  }

  /**
   * @param {string} key
   * @param {unknown} value
   * @returns {Promise<void>}
   */
  async set(key, value) {
    await this.#db.put(STORES.settings, value, key);
  }
}
