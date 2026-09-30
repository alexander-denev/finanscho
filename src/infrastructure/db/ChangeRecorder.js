/**
 * The single write path for synced entities. See docs/SYNC_PROTOCOL.md §4.
 *
 * Every local mutation happens inside one IndexedDB transaction that ticks the HLC, merges the op
 * into the entity record, and appends the op to the outbox. Remote ops are merged here too, so no
 * other module ever writes an entity store.
 */

import { HybridLogicalClock } from '../sync/HybridLogicalClock.js';
import { applyOp, recordToOps } from '../sync/merge.js';
import { isSupportedOp, OP_VERSION } from '../sync/operation.js';
import { STORES } from './database.js';

/** @typedef {import('./database.js').Db} Db */
/** @typedef {import('../sync/merge.js').StoredRecord} StoredRecord */
/** @typedef {import('../sync/operation.js').Op} Op */
/** @typedef {import('../sync/operation.js').EntityName} EntityName */
/** @typedef {import('../sync/operation.js').OpOrigin} OpOrigin */
/** @typedef {import('../../core/ports/changeFeed.js').ChangeFeed} ChangeFeed */
/** @typedef {import('idb').IDBPTransaction<unknown, string[], 'readwrite'>} WriteTx */

export const META_KEYS = /** @type {const} */ ({
  deviceId: 'deviceId',
  deviceName: 'deviceName',
  hlc: 'hlc',
  localSeq: 'localSeq',
  deferredOps: 'deferredOps',
});

/**
 * @typedef {object} WriteRequest
 * @property {EntityName} entity
 * @property {string} id
 * @property {Record<string, unknown>} fields
 * @property {OpOrigin} [origin] defaults to 'user'
 * @property {string} [hlc] explicit clock (seeds, occurrences, imports); defaults to a fresh tick
 */

/**
 * Operations available inside a recorder transaction.
 * @typedef {object} WriteContext
 * @property {(entity: EntityName, id: string) => Promise<StoredRecord | undefined>} get raw stored record, including tombstones
 * @property {(request: WriteRequest) => Promise<{ op: Op, changed: boolean }>} write records an op and merges it
 */

/**
 * Returns the transaction's completion promise with a no-op rejection handler attached, so an
 * abort caused by an earlier failing request is not reported as an unhandled rejection. Callers
 * still await the returned promise to observe the outcome.
 * @param {WriteTx} tx
 * @returns {Promise<void>}
 */
function observeDone(tx) {
  const done = tx.done;
  done.catch(() => {});
  return done;
}

/** Atomic entity write + op append. */
export class ChangeRecorder {
  #db;
  #deviceId;
  #nowMs;
  #changeFeed;

  /**
   * @param {{ db: Db, deviceId: string, nowMs: () => number, changeFeed: ChangeFeed }} deps
   */
  constructor({ db, deviceId, nowMs, changeFeed }) {
    this.#db = db;
    this.#deviceId = deviceId;
    this.#nowMs = nowMs;
    this.#changeFeed = changeFeed;
  }

  /** @returns {string} */
  get deviceId() {
    return this.#deviceId;
  }

  /**
   * Records one or more writes atomically.
   * @param {WriteRequest | WriteRequest[]} requests
   * @returns {Promise<Op[]>}
   */
  async write(requests) {
    const list = Array.isArray(requests) ? requests : [requests];
    const entities = [...new Set(list.map((r) => r.entity))];
    /** @type {Op[]} */
    const ops = [];
    await this.transact(entities, async (ctx) => {
      for (const request of list) ops.push((await ctx.write(request)).op);
    });
    return ops;
  }

  /**
   * Runs `fn` inside one read-write transaction over the given entity stores plus outbox and
   * meta. `fn` may only await IndexedDB work (via the context), or the transaction auto-commits.
   * The change feed is notified after commit for entities whose records changed.
   * @param {EntityName[]} entities
   * @param {(ctx: WriteContext) => Promise<void>} fn
   * @returns {Promise<void>}
   */
  async transact(entities, fn) {
    const tx = /** @type {WriteTx} */ (
      this.#db.transaction([...entities, STORES.outbox, STORES.meta], 'readwrite')
    );
    const done = observeDone(tx);
    const meta = tx.objectStore(STORES.meta);
    const [hlcState, storedSeq] = await Promise.all([
      meta.get(META_KEYS.hlc),
      meta.get(META_KEYS.localSeq),
    ]);
    const clock = new HybridLogicalClock(this.#deviceId, hlcState);
    let seq = typeof storedSeq === 'number' ? storedSeq : 0;
    /** @type {Set<EntityName>} */
    const changed = new Set();

    /** @type {WriteContext} */
    const ctx = {
      get: async (entity, id) =>
        /** @type {StoredRecord | undefined} */ (await tx.objectStore(entity).get(id)),
      write: async ({ entity, id, fields, origin = 'user', hlc }) => {
        const opHlc = clock.tick(this.#nowMs());
        seq += 1;
        /** @type {Op} */
        const op = {
          v: OP_VERSION,
          deviceId: this.#deviceId,
          seq,
          hlc: hlc ?? opHlc,
          entity,
          id,
          fields: structuredClone(fields),
          origin,
        };
        if (hlc !== undefined) clock.receive(hlc, this.#nowMs());
        const store = tx.objectStore(entity);
        const result = applyOp(await store.get(id), op);
        if (result.changed) {
          await store.put(result.record);
          changed.add(entity);
        }
        await tx.objectStore(STORES.outbox).put(op);
        return { op, changed: result.changed };
      },
    };

    try {
      await fn(ctx);
      await meta.put(clock.state, META_KEYS.hlc);
      await meta.put(seq, META_KEYS.localSeq);
      await done;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        // Already finished or aborted; the original error is what matters.
      }
      throw error;
    }
    if (changed.size > 0) this.#changeFeed.publish({ entities: [...changed], source: 'local' });
  }

  /**
   * Prepares for syncing with a different vault: re-queues every record's current state as ops
   * (one per distinct field clock, keeping the original clocks) and clears all remote cursors, so
   * the new vault receives the full data set and is pulled from scratch. Records are unchanged.
   * @returns {Promise<number>} ops queued
   */
  async republishAll() {
    const entities = /** @type {EntityName[]} */ ([
      STORES.accounts,
      STORES.categories,
      STORES.transactions,
      STORES.budgets,
      STORES.recurringRules,
    ]);
    const tx = /** @type {WriteTx} */ (
      this.#db.transaction(
        [...entities, STORES.outbox, STORES.meta, STORES.syncCursors],
        'readwrite',
      )
    );
    const done = observeDone(tx);
    const meta = tx.objectStore(STORES.meta);
    const outbox = tx.objectStore(STORES.outbox);
    const storedSeq = await meta.get(META_KEYS.localSeq);
    let seq = typeof storedSeq === 'number' ? storedSeq : 0;
    let queued = 0;
    for (const entity of entities) {
      const records = /** @type {StoredRecord[]} */ (await tx.objectStore(entity).getAll());
      for (const record of records) {
        for (const { hlc, fields } of recordToOps(record)) {
          seq += 1;
          queued += 1;
          /** @type {Op} */
          const op = {
            v: OP_VERSION,
            deviceId: this.#deviceId,
            seq,
            hlc,
            entity,
            id: record.id,
            fields,
            origin: 'user',
          };
          await outbox.put(op);
        }
      }
    }
    await tx.objectStore(STORES.syncCursors).clear();
    await meta.put(seq, META_KEYS.localSeq);
    await done;
    return queued;
  }

  /**
   * Merges a batch of remote ops from one device and advances that device's cursor, atomically.
   * Ops this client does not understand (newer `v`, unknown entity) are kept in `meta` for replay
   * after an app update instead of being dropped.
   * @param {Op[]} ops ops from one device, ascending seq
   * @param {{ deviceId: string, lastSeq: number }} cursor new cursor position
   * @returns {Promise<{ changed: EntityName[], deferred: number }>}
   */
  async applyRemote(ops, cursor) {
    const stores = [
      STORES.accounts,
      STORES.categories,
      STORES.transactions,
      STORES.budgets,
      STORES.recurringRules,
      STORES.meta,
      STORES.syncCursors,
    ];
    const tx = /** @type {WriteTx} */ (this.#db.transaction(stores, 'readwrite'));
    const done = observeDone(tx);
    const meta = tx.objectStore(STORES.meta);
    const cursors = tx.objectStore(STORES.syncCursors);
    /** @type {Set<EntityName>} */
    const changed = new Set();
    const [hlcState, current, deferredStored] = await Promise.all([
      meta.get(META_KEYS.hlc),
      cursors.get(cursor.deviceId),
      meta.get(META_KEYS.deferredOps),
    ]);
    const clock = new HybridLogicalClock(this.#deviceId, hlcState);
    const appliedSeq = current?.lastSeq ?? 0;
    /** @type {Op[]} */
    const deferred = Array.isArray(deferredStored) ? deferredStored : [];
    const deferredBefore = deferred.length;

    for (const op of ops) {
      if (op.seq <= appliedSeq) continue;
      clock.receive(op.hlc, this.#nowMs());
      if (!isSupportedOp(op)) {
        deferred.push(op);
        continue;
      }
      const store = tx.objectStore(op.entity);
      const result = applyOp(await store.get(op.id), op);
      if (result.changed) {
        await store.put(result.record);
        changed.add(op.entity);
      }
    }
    await meta.put(clock.state, META_KEYS.hlc);
    if (deferred.length !== deferredBefore) await meta.put(deferred, META_KEYS.deferredOps);
    if (cursor.lastSeq > appliedSeq) {
      await cursors.put({ deviceId: cursor.deviceId, lastSeq: cursor.lastSeq });
    }
    await done;
    return { changed: [...changed], deferred: deferred.length - deferredBefore };
  }

  /**
   * Re-applies previously deferred remote ops that this client now supports.
   * @returns {Promise<EntityName[]>} entities that changed
   */
  async replayDeferred() {
    const deferred = /** @type {Op[] | undefined} */ (
      await this.#db.get(STORES.meta, META_KEYS.deferredOps)
    );
    if (!Array.isArray(deferred) || !deferred.some(isSupportedOp)) return [];
    const tx = /** @type {WriteTx} */ (
      this.#db.transaction(
        [...new Set(deferred.filter(isSupportedOp).map((op) => op.entity)), STORES.meta],
        'readwrite',
      )
    );
    const done = observeDone(tx);
    /** @type {Set<EntityName>} */
    const changed = new Set();
    for (const op of deferred.filter(isSupportedOp)) {
      const store = tx.objectStore(op.entity);
      const result = applyOp(await store.get(op.id), op);
      if (result.changed) {
        await store.put(result.record);
        changed.add(op.entity);
      }
    }
    await tx.objectStore(STORES.meta).put(
      deferred.filter((op) => !isSupportedOp(op)),
      META_KEYS.deferredOps,
    );
    await done;
    return [...changed];
  }
}
