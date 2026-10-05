/**
 * Pull/push orchestration over a dumb WebDAV store. See docs/SYNC_PROTOCOL.md §5–§7 and §10.
 * Each device writes only inside `devices/<its id>/`; a cycle is pull, push, then maintenance
 * (compaction and cleanup of this device's own files), one cycle at a time.
 */

import { SyncError } from '../../core/errors.js';
import { STORES } from '../db/database.js';
import { META_KEYS } from '../db/ChangeRecorder.js';
import { parseSegment, parseSegmentFileName, SEGMENT_SIZE, segmentFileName } from './operation.js';
import { parseHead, parseJson } from './deviceHead.js';

/** @typedef {import('../db/database.js').Db} Db */
/** @typedef {import('../db/ChangeRecorder.js').ChangeRecorder} ChangeRecorder */
/** @typedef {import('./operation.js').Op} Op */
/** @typedef {import('./operation.js').EntityName} EntityName */
/** @typedef {import('../../core/ports/syncTransport.js').SyncTransport} SyncTransport */
/** @typedef {import('../../core/ports/changeFeed.js').ChangeFeed} ChangeFeed */
/** @typedef {import('./deviceHead.js').DeviceHead} DeviceHead */
/** @typedef {import('./deviceHead.js').Checkpoint} Checkpoint */

/** Vault format this build reads and writes. Compaction did not change it (D39). */
export const VAULT_FORMAT = 1;

/**
 * A device compacts once more than `max(COMPACT_MIN_OPS, size of its last checkpoint)` of its own
 * ops follow that checkpoint. This bounds its server log to about twice its state plus this many
 * ops, and keeps compaction traffic proportional to normal sync traffic.
 */
export const COMPACT_MIN_OPS = 5000;

/**
 * @typedef {object} SyncResult
 * @property {number} pulled remote ops applied
 * @property {number} pushed local ops published
 * @property {number} deferred remote ops kept for a newer app version
 * @property {string[]} issues human-readable descriptions of skipped malformed remote files
 * @property {string[]} cleanupIssues own superseded files that could not be deleted
 * @property {boolean} cleanupBlocked the server refused or failed a cleanup DELETE (never fatal)
 * @property {boolean} compacted a checkpoint was published in this cycle
 */

/** @typedef {{ deviceId: string, lastSeq: number }} CursorRow */
/** @typedef {import('../../core/ports/syncTransport.js').DeviceInfo} DeviceInfo */

/**
 * @typedef {object} RemovalRequest
 * @property {string} deviceId
 * @property {() => void} resolve
 * @property {(error: unknown) => void} reject
 */

/** Runs sync cycles against one vault. */
export class SyncEngine {
  #db;
  #recorder;
  #transport;
  #deviceId;
  #getDeviceName;
  #afterPull;
  #changeFeed;
  #nowIso;
  #compactMinOps;
  /** @type {boolean} */
  #prepared = false;
  /** @type {DeviceHead | null} */
  #ownHead = null;
  /** @type {Promise<SyncResult> | null} */
  #current = null;
  #again = false;
  #republished = false;
  #compactRequested = false;
  /** @type {RemovalRequest[]} */
  #removals = [];
  /**
   * Remote device folders listed by the last pull.
   * @type {Set<string>}
   */
  #listed = new Set();
  /**
   * Heads from the last pull: null when malformed, absent when the folder has none.
   * @type {Map<string, DeviceHead | null>}
   */
  #remoteHeads = new Map();
  /** @type {DeviceInfo[]} */
  #devices = [];

  /**
   * @param {{
   *   db: Db,
   *   recorder: ChangeRecorder,
   *   transport: SyncTransport,
   *   deviceId: string,
   *   getDeviceName: () => Promise<string>,
   *   afterPull: (changed: ReadonlySet<EntityName>) => Promise<void>,
   *   changeFeed: ChangeFeed,
   *   nowIso: () => string,
   *   compactMinOps?: number,
   * }} deps `afterPull` runs after every pull with the entities it changed (possibly none);
   *   `compactMinOps` overrides COMPACT_MIN_OPS (tests)
   */
  constructor({
    db,
    recorder,
    transport,
    deviceId,
    getDeviceName,
    afterPull,
    changeFeed,
    nowIso,
    compactMinOps = COMPACT_MIN_OPS,
  }) {
    this.#db = db;
    this.#recorder = recorder;
    this.#transport = transport;
    this.#deviceId = deviceId;
    this.#getDeviceName = getDeviceName;
    this.#afterPull = afterPull;
    this.#changeFeed = changeFeed;
    this.#nowIso = nowIso;
    this.#compactMinOps = compactMinOps;
  }

  /** @returns {string} */
  get #ownDir() {
    return `devices/${this.#deviceId}`;
  }

  /**
   * Runs a cycle. A call while a cycle is running schedules exactly one follow-up cycle and
   * resolves when that finishes.
   * @returns {Promise<SyncResult>}
   */
  sync() {
    if (this.#current) {
      this.#again = true;
      return this.#current;
    }
    this.#current = (async () => {
      try {
        /** @type {SyncResult} */
        let result;
        do {
          this.#again = false;
          result = await this.#cycle();
        } while (this.#again);
        return result;
      } catch (error) {
        for (const request of this.#removals.splice(0)) request.reject(error);
        throw error;
      } finally {
        this.#current = null;
      }
    })();
    return this.#current;
  }

  /**
   * Runs a cycle that compacts this device's log whenever that makes it smaller, regardless of
   * the usual threshold, and removes every superseded file ("Clean up server data").
   * @returns {Promise<SyncResult>}
   */
  compactNow() {
    this.#compactRequested = true;
    return this.sync();
  }

  /**
   * Removes another device's folder from the vault (§11): after a full pull, only if every change
   * from it is applied here, and only after a fresh checkpoint of this device — which now contains
   * that device's surviving data — is published. Rejects with `removeIncomplete` otherwise.
   * Runs inside the sync mutex, as part of a cycle.
   * @param {string} deviceId
   * @returns {Promise<void>}
   */
  removeDevice(deviceId) {
    const removed = new Promise((resolve, reject) => {
      this.#removals.push({ deviceId, resolve: () => resolve(undefined), reject });
    });
    // Failures reach the caller through `removed`.
    this.sync().catch(() => {});
    return /** @type {Promise<void>} */ (removed);
  }

  /**
   * The devices in this vault as of the last cycle, this device first.
   * @returns {DeviceInfo[]}
   */
  devices() {
    return this.#devices;
  }

  /** @returns {Promise<SyncResult>} */
  async #cycle() {
    await this.#prepare();
    const pull = await this.#pull();
    let pushed = await this.#push();
    for (const request of this.#removals.splice(0)) {
      try {
        pushed += await this.#remove(request.deviceId);
        request.resolve();
      } catch (error) {
        request.reject(error);
      }
    }
    const maintenance = await this.#maintain();
    await this.#refreshDevices();
    return { ...pull, ...maintenance, pushed: pushed + maintenance.pushed };
  }

  /**
   * @param {string} deviceId
   * @returns {Promise<number>} ops published for the checkpoint
   */
  async #remove(deviceId) {
    if (deviceId === this.#deviceId) {
      throw new SyncError('removeIncomplete', 'A device cannot remove itself');
    }
    if (!this.#listed.has(deviceId)) {
      await this.#db.delete(STORES.syncCursors, deviceId);
      return 0;
    }
    const head = this.#remoteHeads.get(deviceId);
    const row = /** @type {CursorRow | undefined} */ (
      await this.#db.get(STORES.syncCursors, deviceId)
    );
    const deferred = /** @type {Op[] | undefined} */ (
      await this.#db.get(STORES.meta, META_KEYS.deferredOps)
    );
    const behind = head === null || (head !== undefined && (row?.lastSeq ?? 0) < head.lastSeq);
    if (behind || (deferred ?? []).some((op) => op.deviceId === deviceId)) {
      throw new SyncError('removeIncomplete', `Not every change from ${deviceId} is applied here`);
    }
    const createdAt = this.#nowIso();
    let checkpoint = await this.#recorder.queueCheckpoint({ createdAt });
    let pushed = 0;
    if (!checkpoint) {
      // Local writes (or an earlier checkpoint) were still queued: publish them, then try again.
      pushed += await this.#push();
      checkpoint = await this.#recorder.queueCheckpoint({ createdAt });
    }
    pushed += await this.#push();
    if (!checkpoint || (await this.#pendingCheckpoint()) !== null) {
      throw new SyncError('removeIncomplete', 'Could not publish a checkpoint first');
    }
    // The single exception to single-writer: user-initiated, and it only ever deletes (§11).
    await this.#transport.delete(`devices/${deviceId}/`);
    await this.#db.delete(STORES.syncCursors, deviceId);
    this.#listed.delete(deviceId);
    this.#remoteHeads.delete(deviceId);
    return pushed;
  }

  /**
   * Rebuilds the device list from the last pull's heads and this device's own head.
   * @returns {Promise<void>}
   */
  async #refreshDevices() {
    const rows = /** @type {CursorRow[]} */ (await this.#db.getAll(STORES.syncCursors));
    const cursors = new Map(rows.map((r) => [r.deviceId, r.lastSeq]));
    const own = await this.#loadOwnHead();
    /** @type {DeviceInfo[]} */
    const devices = [
      {
        deviceId: this.#deviceId,
        deviceName: await this.#getDeviceName(),
        lastSeenAt: own.updatedAt ?? null,
        fullySynced: (await this.#db.count(STORES.outbox)) === 0,
        isSelf: true,
      },
    ];
    for (const id of [...this.#listed].sort()) {
      const head = this.#remoteHeads.get(id);
      devices.push({
        deviceId: id,
        deviceName: head?.deviceName ?? '',
        lastSeenAt: head?.updatedAt ?? null,
        // A folder without a head has nothing to read; a malformed head cannot be read.
        fullySynced:
          head === undefined ? true : head !== null && (cursors.get(id) ?? 0) >= head.lastSeq,
        isSelf: false,
      });
    }
    this.#devices = devices;
  }

  /**
   * Checks the vault format before writing anything, creates the vault if needed, and ensures
   * this device's folders exist (once per engine).
   * @returns {Promise<void>}
   */
  async #prepare() {
    const vaultText = await this.#transport.get('vault.json');
    if (vaultText === null) {
      await this.#transport.ensureCollection('');
      await this.#transport.put(
        'vault.json',
        JSON.stringify({ format: VAULT_FORMAT, createdAt: this.#nowIso() }),
      );
    } else {
      const vault = parseJson(vaultText);
      const format =
        typeof vault === 'object' && vault !== null
          ? /** @type {Record<string, unknown>} */ (vault).format
          : undefined;
      if (typeof format !== 'number') throw new SyncError('malformed', 'vault.json is not valid');
      if (format > VAULT_FORMAT) {
        throw new SyncError('vaultTooNew', `Vault format ${format} needs a newer app version`);
      }
    }
    if (this.#prepared) return;
    await this.#transport.ensureCollection(`${this.#ownDir}/ops`);
    this.#prepared = true;
  }

  /**
   * Reads every remote head, then applies devices in the order that skips the most work: the
   * device whose unread checkpoint covers the most unread ops of others first (§10.4).
   * @returns {Promise<Pick<SyncResult, 'pulled' | 'deferred' | 'issues'>>}
   */
  async #pull() {
    const entries = await this.#transport.list('devices');
    const remoteIds = entries
      .filter((e) => e.isCollection && e.name !== this.#deviceId)
      .map((e) => e.name)
      .sort();
    const cursors = await this.#loadCursors(remoteIds);
    /** @type {Set<EntityName>} */
    const changed = new Set();
    /** @type {string[]} */
    const issues = [];
    let pulled = 0;
    let deferred = 0;

    /** @type {Map<string, DeviceHead>} */
    const heads = new Map();
    this.#listed = new Set(remoteIds);
    this.#remoteHeads = new Map();
    for (const remoteId of remoteIds) {
      const headText = await this.#transport.get(`devices/${remoteId}/head.json`);
      if (headText === null) continue;
      const head = parseHead(parseJson(headText), remoteId);
      this.#remoteHeads.set(remoteId, head);
      if (!head) {
        issues.push(`devices/${remoteId}/head.json is malformed`);
        continue;
      }
      heads.set(remoteId, head);
    }

    for (
      let next = this.#nextDevice(heads, cursors);
      next;
      next = this.#nextDevice(heads, cursors)
    ) {
      const head = next;
      heads.delete(head.deviceId);
      let cursor = cursors.get(head.deviceId) ?? 0;
      if (head.lastSeq <= cursor) continue;
      const checkpoint = head.checkpoint;
      for (const segment of head.segments) {
        if (segment.endSeq <= cursor) continue;
        const path = `devices/${head.deviceId}/ops/${segment.file}`;
        const text = await this.#transport.get(path);
        const parsed = parseSegment(parseJson(text), { deviceId: head.deviceId, ...segment });
        if (!parsed.ok) {
          issues.push(`${path}: ${text === null ? 'missing' : parsed.reason}`);
          break;
        }
        const fresh = parsed.ops.filter((op) => op.seq > cursor);
        // Having applied the checkpoint's last segment, every op the checkpoint covers is here.
        // Only devices still on the server: a cursor for a removed device is never used.
        const frontier =
          checkpoint && segment.endSeq === checkpoint.endSeq
            ? Object.fromEntries(
                Object.entries(checkpoint.frontier).filter(([id]) => this.#listed.has(id)),
              )
            : undefined;
        const result = await this.#recorder.applyRemote(
          fresh,
          { deviceId: head.deviceId, lastSeq: segment.endSeq },
          frontier,
        );
        for (const entity of result.changed) changed.add(entity);
        pulled += fresh.length;
        deferred += result.deferred;
        cursor = segment.endSeq;
        cursors.set(head.deviceId, cursor);
        for (const [id, seq] of Object.entries(frontier ?? {})) {
          if (id !== this.#deviceId && (cursors.get(id) ?? 0) < seq) cursors.set(id, seq);
        }
      }
    }

    await this.#afterPull(changed);
    if (changed.size > 0) this.#changeFeed.publish({ entities: [...changed], source: 'remote' });
    return { pulled, deferred, issues };
  }

  /**
   * Reads remote cursors, dropping rows for devices no longer on the server: a device that comes
   * back has seqs above any stale cursor, and a missing cursor only means a full re-read.
   * @param {string[]} remoteIds
   * @returns {Promise<Map<string, number>>}
   */
  async #loadCursors(remoteIds) {
    const rows = /** @type {CursorRow[]} */ (await this.#db.getAll(STORES.syncCursors));
    const listed = new Set(remoteIds);
    for (const row of rows) {
      if (!listed.has(row.deviceId)) await this.#db.delete(STORES.syncCursors, row.deviceId);
    }
    return new Map(
      rows.filter((row) => listed.has(row.deviceId)).map((row) => [row.deviceId, row.lastSeq]),
    );
  }

  /**
   * Picks the next device to pull: the one whose unread checkpoint would raise other cursors the
   * most, then the rest by ID.
   * @param {Map<string, DeviceHead>} heads devices not pulled yet
   * @param {Map<string, number>} cursors
   * @returns {DeviceHead | undefined}
   */
  #nextDevice(heads, cursors) {
    /** @type {DeviceHead | undefined} */
    let best;
    let bestCoverage = 0;
    for (const head of heads.values()) {
      const checkpoint = head.checkpoint;
      if (!checkpoint || (cursors.get(head.deviceId) ?? 0) >= checkpoint.endSeq) continue;
      let coverage = 0;
      for (const [id, seq] of Object.entries(checkpoint.frontier)) {
        if (id === this.#deviceId || id === head.deviceId) continue;
        coverage += Math.max(0, seq - (cursors.get(id) ?? 0));
      }
      if (coverage > bestCoverage) {
        best = head;
        bestCoverage = coverage;
      }
    }
    return best ?? heads.values().next().value;
  }

  /** @returns {Promise<DeviceHead>} */
  async #loadOwnHead() {
    if (this.#ownHead) return this.#ownHead;
    const text = await this.#transport.get(`${this.#ownDir}/head.json`);
    const parsed = text === null ? null : parseHead(parseJson(text), this.#deviceId);
    if (text !== null && !parsed) {
      throw new SyncError('malformed', 'This device’s head.json on the server is malformed');
    }
    this.#ownHead = parsed ?? {
      deviceId: this.#deviceId,
      deviceName: '',
      lastSeq: 0,
      segments: [],
    };
    return this.#ownHead;
  }

  /** @returns {Promise<Checkpoint | null>} */
  async #pendingCheckpoint() {
    const pending = await this.#db.get(STORES.meta, META_KEYS.pendingCheckpoint);
    return pending ? /** @type {Checkpoint} */ (pending) : null;
  }

  /**
   * The checkpoint's head is published: forget the pending checkpoint and schedule cleanup of the
   * files it superseded.
   * @returns {Promise<void>}
   */
  async #checkpointPublished() {
    await this.#db.put(STORES.meta, true, META_KEYS.gcPending);
    await this.#db.delete(STORES.meta, META_KEYS.pendingCheckpoint);
  }

  /**
   * Publishes outbox ops in segments: segment PUT, then head PUT, then outbox trim. A segment never
   * straddles the end of a pending checkpoint; the head PUT that completes it lists only the
   * checkpoint and later segments and records the checkpoint, which every later head carries on.
   * @returns {Promise<number>} ops published
   */
  async #push() {
    let head = await this.#loadOwnHead();
    let pending = await this.#pendingCheckpoint();
    let pushed = 0;
    let recreated = false;
    for (;;) {
      if (pending && head.lastSeq >= pending.endSeq) {
        // Crash recovery: the checkpoint's head went out, but the pending marker was not cleared.
        await this.#checkpointPublished();
        pending = null;
      }
      let ops = /** @type {Op[]} */ (await this.#db.getAll(STORES.outbox, null, SEGMENT_SIZE));
      if (ops.length === 0) break;
      // Ops already in the head were published before a crash that skipped the outbox trim.
      const published = ops.filter((op) => op.seq <= head.lastSeq);
      if (published.length > 0) {
        await this.#trimOutbox(published.at(-1)?.seq ?? 0);
        continue;
      }
      const startSeq = ops[0].seq;
      if (startSeq > head.lastSeq + 1 && !this.#republished) {
        // The server lost ops we already trimmed (e.g. restored from an old backup): queue the
        // full current state once so the vault receives everything again.
        this.#republished = true;
        await this.#recorder.republishAll();
        pending = await this.#pendingCheckpoint();
      }
      const checkpoint = pending;
      if (checkpoint && startSeq <= checkpoint.endSeq) {
        ops = ops.filter((op) => op.seq <= checkpoint.endSeq);
      }
      const endSeq = ops[ops.length - 1].seq;
      const file = segmentFileName(startSeq, endSeq);
      try {
        await this.#transport.put(`${this.#ownDir}/ops/${file}`, JSON.stringify(ops));
      } catch (error) {
        if (recreated || !(error instanceof SyncError) || error.reason !== 'notFound') throw error;
        // Our folder is gone: another device removed this one (§11). Recreate it and start over;
        // when our head is gone too, the gap check above republishes the full state.
        recreated = true;
        await this.#transport.ensureCollection(`${this.#ownDir}/ops`);
        this.#ownHead = null;
        head = await this.#loadOwnHead();
        if (head.lastSeq === 0) this.#republished = false;
        continue;
      }
      const completes = checkpoint !== null && endSeq === checkpoint.endSeq;
      const segments = [...head.segments, { file, startSeq, endSeq }];
      /** @type {DeviceHead} */
      const next = {
        deviceId: this.#deviceId,
        deviceName: await this.#getDeviceName(),
        lastSeq: endSeq,
        segments:
          completes && checkpoint
            ? segments.filter((s) => s.startSeq >= checkpoint.startSeq)
            : segments,
        updatedAt: this.#nowIso(),
      };
      const carried = completes ? checkpoint : head.checkpoint;
      if (carried) next.checkpoint = carried;
      await this.#transport.put(`${this.#ownDir}/head.json`, JSON.stringify(next));
      this.#ownHead = next;
      head = next;
      if (completes) {
        await this.#checkpointPublished();
        pending = null;
      }
      await this.#trimOutbox(endSeq);
      pushed += ops.length;
    }
    return pushed;
  }

  /**
   * After a successful pull and push: compacts this device's log when due (or requested), then
   * deletes superseded files while cleanup is pending. Cleanup failures never fail the cycle.
   * @returns {Promise<Pick<SyncResult, 'pushed' | 'cleanupIssues' | 'cleanupBlocked' | 'compacted'>>}
   */
  async #maintain() {
    const requested = this.#compactRequested;
    this.#compactRequested = false;
    const head = await this.#loadOwnHead();
    let pushed = 0;
    let compacted = false;
    if (await this.#compactionDue(head, requested)) {
      const listed = head.segments.reduce((n, s) => n + s.endSeq - s.startSeq + 1, 0);
      // A checkpoint is only worth it when it is smaller than what it replaces.
      const queued = await this.#recorder.queueCheckpoint({
        createdAt: this.#nowIso(),
        maxOps: listed - 1,
      });
      if (queued) {
        pushed = await this.#push();
        compacted = (await this.#pendingCheckpoint()) === null;
      }
    }
    const gcPending = (await this.#db.get(STORES.meta, META_KEYS.gcPending)) === true;
    const cleanup =
      requested || gcPending
        ? await this.#collectGarbage()
        : { cleanupIssues: [], cleanupBlocked: false };
    return { pushed, compacted, ...cleanup };
  }

  /**
   * @param {DeviceHead} head
   * @param {boolean} requested
   * @returns {Promise<boolean>}
   */
  async #compactionDue(head, requested) {
    if ((await this.#pendingCheckpoint()) !== null) return false;
    if (requested) return true;
    const checkpoint = head.checkpoint;
    const since = head.lastSeq - (checkpoint?.endSeq ?? 0);
    const size = checkpoint ? checkpoint.endSeq - checkpoint.startSeq + 1 : 0;
    return since > Math.max(this.#compactMinOps, size);
  }

  /**
   * Deletes this device's segment files that the current head no longer lists (superseded by a
   * checkpoint, or orphans from crashed pushes) and that end at or before its last seq. Files past
   * the last seq may still be published by a later push. Stops at the first failure — for example
   * when the server's CORS rules do not allow DELETE — and retries in a later cycle.
   * @returns {Promise<Pick<SyncResult, 'cleanupIssues' | 'cleanupBlocked'>>}
   */
  async #collectGarbage() {
    const head = await this.#loadOwnHead();
    const listed = new Set(head.segments.map((s) => s.file));
    /** @type {string[]} */
    const cleanupIssues = [];
    try {
      for (const entry of await this.#transport.list(`${this.#ownDir}/ops`)) {
        if (entry.isCollection || listed.has(entry.name)) continue;
        const range = parseSegmentFileName(entry.name);
        if (!range || range.endSeq > head.lastSeq) continue;
        await this.#transport.delete(`${this.#ownDir}/ops/${entry.name}`);
      }
    } catch (error) {
      const reason = error instanceof SyncError ? error.reason : 'unknown';
      cleanupIssues.push(`Could not delete superseded files in ${this.#ownDir}/ops (${reason})`);
      return { cleanupIssues, cleanupBlocked: true };
    }
    await this.#db.delete(STORES.meta, META_KEYS.gcPending);
    return { cleanupIssues, cleanupBlocked: false };
  }

  /**
   * Deletes outbox ops up to and including `lastSeq`.
   * @param {number} lastSeq
   * @returns {Promise<void>}
   */
  async #trimOutbox(lastSeq) {
    await this.#db.delete(STORES.outbox, IDBKeyRange.upperBound(lastSeq));
  }
}
