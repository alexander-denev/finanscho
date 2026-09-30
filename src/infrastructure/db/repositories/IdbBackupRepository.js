import { HybridLogicalClock } from '../../sync/HybridLogicalClock.js';
import { applyOp, recordToOps } from '../../sync/merge.js';
import { isEntityName, SYNCED_ENTITIES } from '../../sync/operation.js';

/** @typedef {import('../database.js').Db} Db */
/** @typedef {import('../ChangeRecorder.js').ChangeRecorder} ChangeRecorder */
/** @typedef {import('../../sync/merge.js').StoredRecord} StoredRecord */

/**
 * @param {unknown} value
 * @returns {value is StoredRecord}
 */
function isStoredRecord(value) {
  if (typeof value !== 'object' || value === null) return false;
  const record = /** @type {Record<string, unknown>} */ (value);
  if (typeof record.id !== 'string' || record.id === '') return false;
  const clocks = record._clocks;
  if (typeof clocks !== 'object' || clocks === null || Array.isArray(clocks)) return false;
  return Object.values(clocks).every((hlc) => HybridLogicalClock.isValid(hlc));
}

/**
 * Backup access to every synced record. Import replays each record's fields, grouped by clock,
 * through ChangeRecorder: into an empty database this restores the records exactly (same values
 * and clocks); into a non-empty one it merges via the normal merge. Either way the imported data
 * lands in the outbox, so it propagates to other devices when sync is enabled.
 */
export class IdbBackupRepository {
  #db;
  #recorder;

  /** @param {{ db: Db, recorder: ChangeRecorder }} deps */
  constructor({ db, recorder }) {
    this.#db = db;
    this.#recorder = recorder;
  }

  /** @returns {Promise<Record<string, StoredRecord[]>>} */
  async exportAll() {
    /** @type {Record<string, StoredRecord[]>} */
    const result = {};
    for (const entity of SYNCED_ENTITIES) {
      result[entity] = /** @type {StoredRecord[]} */ (await this.#db.getAll(entity));
    }
    return result;
  }

  /**
   * @param {Record<string, unknown[]>} entities
   * @returns {Promise<number>} number of records that changed
   */
  async importAll(entities) {
    let changedRecords = 0;
    for (const [entity, records] of Object.entries(entities)) {
      if (!isEntityName(entity) || !Array.isArray(records)) continue;
      await this.#recorder.transact([entity], async (ctx) => {
        for (const record of records) {
          if (!isStoredRecord(record)) continue;
          let current = await ctx.get(entity, record.id);
          let changed = false;
          for (const op of recordToOps(record)) {
            const preview = applyOp(current, op);
            if (!preview.changed) continue;
            await ctx.write({ entity, id: record.id, fields: op.fields, hlc: op.hlc });
            current = preview.record;
            changed = true;
          }
          if (changed) changedRecords += 1;
        }
      });
    }
    return changedRecords;
  }
}
