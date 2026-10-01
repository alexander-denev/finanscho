import { STORES } from './database.js';

/** @typedef {import('./database.js').Db} Db */
/** @typedef {import('../../core/ports/credentialStore.js').WebDavCredentials} WebDavCredentials */

const KEY = 'webdavCredentials';

/**
 * Credential store: keeps WebDAV credentials in IndexedDB (`meta`), the only durable storage a
 * PWA has (see docs/DECISIONS.md, D35).
 */
export class IdbCredentialStore {
  #db;

  /** @param {{ db: Db }} deps */
  constructor({ db }) {
    this.#db = db;
  }

  /** @returns {Promise<WebDavCredentials | null>} */
  async load() {
    const value = await this.#db.get(STORES.meta, KEY);
    if (!value || typeof value !== 'object') return null;
    const { url, vaultPath, username, password } = /** @type {Record<string, unknown>} */ (value);
    if ([url, vaultPath, username, password].some((v) => typeof v !== 'string')) return null;
    return /** @type {WebDavCredentials} */ ({ url, vaultPath, username, password });
  }

  /**
   * @param {WebDavCredentials} credentials
   * @returns {Promise<void>}
   */
  async save(credentials) {
    await this.#db.put(STORES.meta, { ...credentials }, KEY);
  }

  /** @returns {Promise<void>} */
  async clear() {
    await this.#db.delete(STORES.meta, KEY);
  }
}
