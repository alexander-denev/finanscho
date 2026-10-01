/**
 * The single write path for synced entities. See docs/SYNC_PROTOCOL.md §4.
 *
 * Every local mutation happens inside one IndexedDB transaction that ticks the HLC, merges the op
 * into the entity record, and appends the op to the outbox. Remote ops are merged here too, so no
 * other module ever writes an entity store.
 */

import { HybridLogicalClock } from '../sync/HybridLogicalClock.js';
import { applyOp, isPrunableTombstone, recordToOps, tombstoneStub } from '../sync/merge.js';
import { isSupportedOp, OP_VERSION } from '../sync/operation.js';
import { STORES } from './database.js';

/** @typedef {import('./database.js').Db} Db */
/** @typedef {import('../sync/merge.js').StoredRecord} StoredRecord */
/** @typedef {import('../sync/operation.js').Op} Op */
/** @typedef {import('../sync/operation.js').EntityName} EntityName */
/** @typedef {import('../sync/operation.js').OpOrigin} OpOrigin */
/** @typedef {import('../../core/ports/changeFeed.js').ChangeFeed} ChangeFeed */
/** @typedef {import('../sync/deviceHead.js').Checkpoint} Checkpoint */
/** @typedef {import('idb').IDBPTransaction<unknown, string[], 'readwrite'>} WriteTx */

export const META_KEYS = /** @type {const} */ ({
  deviceId: 'deviceId',
  deviceName: 'deviceName',
  hlc: 'hlc',
  localSeq: 'localSeq',
  deferredOps: 'deferredOps',
  /** A queued checkpoint not yet published (`Checkpoint`); see SyncEngine. */
  pendingCheckpoint: 'pendingCheckpoint',
  /** True while superseded segment files may still be on the server. */
  gcPending: 'gcPending',
});

/** Tombstones deleted longer ago than this are pruned to stubs locally (docs/DECISIONS.md, D40). */
export const TOMBSTONE_PRUNE_AGE_MS = 30 * 86_400_000;

/** Entity stores, in the order their state is re-queued. */
const ENTITIES = /** @type {EntityName[]} */ ([
  STORES.accounts,
  STORES.categories,
  STORES.transactions,
  STORES.budgets,
  STORES.recurringRules,
]);

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
   * Builds ops (one per distinct field clock, original clocks kept) for every record's current
   * state, with seqs following `lastSeq`. Shared by republishing and checkpoints.
   * @param {WriteTx} tx a transaction over every entity store
   * @param {number} lastSeq
   * @param {{ stubs: boolean }} options `stubs`: reduce tombstones to stubs
   * @returns {Promise<Op[]>}
   */
  async #stateOps(tx, lastSeq, { stubs }) {
    /** @type {Op[]} */
    const ops = [];
    let seq = lastSeq;
    for (const entity of ENTITIES) {
      const records = /** @type {StoredRecord[]} */ (await tx.objectStore(entity).getAll());
      for (const stored of records) {
        const record = stubs ? tombstoneStub(stored) : stored;
        for (const { hlc, fields } of recordToOps(record)) {
          seq += 1;
          ops.push({
            v: OP_VERSION,
            deviceId: this.#deviceId,
            seq,
            hlc,
            entity,
            id: record.id,
            fields,
            origin: 'user',
          });
        }
      }
    }
    return ops;
  }

  /**
   * Prepares for syncing with a different vault: re-queues every record's current state as ops
   * (one per distinct field clock, keeping the original clocks) and clears all remote cursors, so
   * the new vault receives the full data set and is pulled from scratch. Records are unchanged.
   * A pending checkpoint and pending cleanup are dropped; their ops are published as plain ops.
   * @returns {Promise<number>} ops queued
   */
  async republishAll() {
    const tx = /** @type {WriteTx} */ (
      this.#db.transaction(
        [...ENTITIES, STORES.outbox, STORES.meta, STORES.syncCursors],
        'readwrite',
      )
    );
    const done = observeDone(tx);
    const meta = tx.objectStore(STORES.meta);
    const outbox = tx.objectStore(STORES.outbox);
    const storedSeq = await meta.get(META_KEYS.localSeq);
    const ops = await this.#stateOps(tx, typeof storedSeq === 'number' ? storedSeq : 0, {
      stubs: false,
    });
    for (const op of ops) await outbox.put(op);
    await tx.objectStore(STORES.syncCursors).clear();
    await meta.delete(META_KEYS.pendingCheckpoint);
    await meta.delete(META_KEYS.gcPending);
    if (ops.length > 0) await meta.put(ops[ops.length - 1].seq, META_KEYS.localSeq);
    await done;
    return ops.length;
  }

  /**
   * Queues a checkpoint (docs/SYNC_PROTOCOL.md §10): this device's full current state as fresh ops
   * with original clocks, tombstones reduced to stubs, plus the frontier — the remote cursors whose
   * ops that state already contains. Devices with deferred ops are left out of the frontier, since
   * those ops are not in the state. Cursors are kept. Runs in one transaction, so local writes land
   * entirely before or after it.
   *
   * Returns null without queueing anything when the outbox is not empty (every earlier op must be
   * published first), a checkpoint is already pending, there is no state, or the checkpoint would
   * exceed `maxOps` (it would not shrink the log).
   * @param {{ createdAt: string, maxOps?: number }} options
   * @returns {Promise<Checkpoint | null>}
   */
  async queueCheckpoint({ createdAt, maxOps = Number.POSITIVE_INFINITY }) {
    const tx = /** @type {WriteTx} */ (
      this.#db.transaction(
        [...ENTITIES, STORES.outbox, STORES.meta, STORES.syncCursors],
        'readwrite',
      )
    );
    const done = observeDone(tx);
    const meta = tx.objectStore(STORES.meta);
    const outbox = tx.objectStore(STORES.outbox);
    const [queued, storedSeq, pending, deferredStored, cursorRows] = await Promise.all([
      outbox.count(),
      meta.get(META_KEYS.localSeq),
      meta.get(META_KEYS.pendingCheckpoint),
      meta.get(META_KEYS.deferredOps),
      /** @type {Promise<{ deviceId: string, lastSeq: number }[]>} */ (
        tx.objectStore(STORES.syncCursors).getAll()
      ),
    ]);
    if (queued > 0 || pending) {
      await done;
      return null;
    }
    const ops = await this.#stateOps(tx, typeof storedSeq === 'number' ? storedSeq : 0, {
      stubs: true,
    });
    if (ops.length === 0 || ops.length > maxOps) {
      await done;
      return null;
    }
    const deferredFrom = new Set(
      (Array.isArray(deferredStored) ? /** @type {Op[]} */ (deferredStored) : []).map(
        (op) => op.deviceId,
      ),
    );
    /** @type {Record<string, number>} */
    const frontier = {};
    for (const { deviceId, lastSeq } of cursorRows) {
      if (lastSeq > 0 && !deferredFrom.has(deviceId)) frontier[deviceId] = lastSeq;
    }
    /** @type {Checkpoint} */
    const checkpoint = {
      startSeq: ops[0].seq,
      endSeq: ops[ops.length - 1].seq,
      frontier,
      createdAt,
    };
    for (const op of ops) await outbox.put(op);
    await meta.put(checkpoint, META_KEYS.pendingCheckpoint);
    await meta.put(checkpoint.endSeq, META_KEYS.localSeq);
    await done;
    return checkpoint;
  }

  /**
   * Rewrites tombstones deleted more than `olderThanMs` ago as stubs (`tombstoneStub`). Local
   * only: no ops, no change-feed event (nothing visible changes). Stubs are never purged: recurring
   * materialization relies on the ID existing, and `_clocks.deleted` must keep beating late ops.
   * @param {number} nowMs
   * @param {number} [olderThanMs]
   * @returns {Promise<number>} records pruned
   */
  async pruneTombstones(nowMs, olderThanMs = TOMBSTONE_PRUNE_AGE_MS) {
    const tx = /** @type {WriteTx} */ (this.#db.transaction(ENTITIES, 'readwrite'));
    const done = observeDone(tx);
    let pruned = 0;
    for (const entity of ENTITIES) {
      const store = tx.objectStore(entity);
      const records = /** @type {StoredRecord[]} */ (await store.getAll());
      for (const record of records) {
        if (!isPrunableTombstone(record, nowMs, olderThanMs)) continue;
        await store.put(tombstoneStub(record));
        pruned += 1;
      }
    }
    await done;
    return pruned;
  }

  /**
   * Merges a batch of remote ops from one device and advances that device's cursor, atomically.
   * Ops this client does not understand (newer `v`, unknown entity) are kept in `meta` for replay
   * after an app update instead of being dropped.
   *
   * `frontier` is passed with the last segment of a checkpoint: the checkpoint contains every op
   * of those devices up to those seqs, so their cursors are raised to at least that far, in the
   * same transaction (docs/SYNC_PROTOCOL.md §10.4).
   * @param {Op[]} ops ops from one device, ascending seq
   * @param {{ deviceId: string, lastSeq: number }} cursor new cursor position
   * @param {Record<string, number>} [frontier]
   * @returns {Promise<{ changed: EntityName[], deferred: number }>}
   */
  async applyRemote(ops, cursor, frontier) {
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
    for (const [deviceId, lastSeq] of Object.entries(frontier ?? {})) {
      if (deviceId === this.#deviceId || deviceId === cursor.deviceId) continue;
      const row = /** @type {{ lastSeq: number } | undefined} */ (await cursors.get(deviceId));
      if ((row?.lastSeq ?? 0) < lastSeq) await cursors.put({ deviceId, lastSeq });
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
