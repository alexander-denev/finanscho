import { BackupError } from '../errors.js';

/** @typedef {import('../ports/repositories.js').BackupRepository} BackupRepository */
/** @typedef {import('../ports/clock.js').Clock} Clock */

/** Backup file format version written by this build. */
export const BACKUP_FORMAT = 1;

/**
 * @typedef {object} BackupFile
 * @property {'finanscho-backup'} kind
 * @property {number} format
 * @property {string} exportedAt
 * @property {Record<string, unknown[]>} entities every record, including `_clocks` and tombstones
 */

/** JSON export and import of the full local database. */
export class BackupService {
  #backup;
  #clock;

  /** @param {{ backup: BackupRepository, clock: Clock }} deps */
  constructor({ backup, clock }) {
    this.#backup = backup;
    this.#clock = clock;
  }

  /** @returns {Promise<string>} pretty-printed JSON */
  async exportJson() {
    /** @type {BackupFile} */
    const file = {
      kind: 'finanscho-backup',
      format: BACKUP_FORMAT,
      exportedAt: this.#clock.nowIso(),
      entities: await this.#backup.exportAll(),
    };
    return JSON.stringify(file, null, 2);
  }

  /** @returns {string} a suggested file name for today's export */
  fileName() {
    return `finanscho-backup-${this.#clock.today()}.json`;
  }

  /**
   * Imports a backup. Into an empty database this restores it exactly; otherwise it merges.
   * @param {string} text file contents
   * @returns {Promise<number>} number of records that changed
   * @throws {BackupError}
   */
  async importJson(text) {
    /** @type {unknown} */
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new BackupError('invalidFile');
    }
    if (typeof parsed !== 'object' || parsed === null) throw new BackupError('invalidFile');
    const file = /** @type {Record<string, unknown>} */ (parsed);
    if (file.kind !== 'finanscho-backup' || typeof file.format !== 'number') {
      throw new BackupError('invalidFile');
    }
    if (file.format > BACKUP_FORMAT) throw new BackupError('formatTooNew');
    const entities = file.entities;
    if (typeof entities !== 'object' || entities === null || Array.isArray(entities)) {
      throw new BackupError('invalidFile');
    }
    /** @type {Record<string, import('../ports/repositories.js').SyncRecord[]>} */
    const lists = {};
    for (const [name, records] of Object.entries(entities)) {
      if (!Array.isArray(records)) throw new BackupError('invalidFile');
      lists[name] = records;
    }
    return this.#backup.importAll(lists);
  }
}
