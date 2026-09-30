import { META_KEYS } from '../ChangeRecorder.js';
import { STORES } from '../database.js';

/** @typedef {import('../database.js').Db} Db */

/** Device identity stored in `meta` (never synced as data; published in the device's head.json). */
export class IdbDeviceRepository {
  #db;
  #newId;

  /**
   * @param {{ db: Db, newId: () => string }} deps
   */
  constructor({ db, newId }) {
    this.#db = db;
    this.#newId = newId;
  }

  /**
   * Returns this install's device ID, creating it atomically on first use.
   * @returns {Promise<string>}
   */
  async getDeviceId() {
    const tx = this.#db.transaction(STORES.meta, 'readwrite');
    let id = /** @type {string | undefined} */ (await tx.store.get(META_KEYS.deviceId));
    if (typeof id !== 'string') {
      id = this.#newId();
      await tx.store.put(id, META_KEYS.deviceId);
    }
    await tx.done;
    return id;
  }

  /** @returns {Promise<string>} the user-chosen device name, or '' */
  async getDeviceName() {
    const name = await this.#db.get(STORES.meta, META_KEYS.deviceName);
    return typeof name === 'string' ? name : '';
  }

  /**
   * @param {string} name
   * @returns {Promise<void>}
   */
  async setDeviceName(name) {
    await this.#db.put(STORES.meta, name, META_KEYS.deviceName);
  }
}
