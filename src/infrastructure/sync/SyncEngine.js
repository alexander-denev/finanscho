/**
 * Pull/push orchestration over a dumb WebDAV store. See docs/SYNC_PROTOCOL.md §5–§7.
 * Each device writes only inside `devices/<its id>/`; a cycle is pull then push, one at a time.
 */

import { SyncError } from '../../core/errors.js';
import { STORES } from '../db/database.js';
import { parseSegment, SEGMENT_SIZE, segmentFileName } from './operation.js';
import { parseHead, parseJson } from './deviceHead.js';

/** @typedef {import('../db/database.js').Db} Db */
/** @typedef {import('../db/ChangeRecorder.js').ChangeRecorder} ChangeRecorder */
/** @typedef {import('./operation.js').Op} Op */
/** @typedef {import('./operation.js').EntityName} EntityName */
/** @typedef {import('../../core/ports/syncTransport.js').SyncTransport} SyncTransport */
/** @typedef {import('../../core/ports/changeFeed.js').ChangeFeed} ChangeFeed */
/** @typedef {import('./deviceHead.js').DeviceHead} DeviceHead */

/** Vault format this build reads and writes. */
export const VAULT_FORMAT = 1;

/**
 * @typedef {object} SyncResult
 * @property {number} pulled remote ops applied
 * @property {number} pushed local ops published
 * @property {number} deferred remote ops kept for a newer app version
 * @property {string[]} issues human-readable descriptions of skipped malformed remote files
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
  /** @type {boolean} */
  #prepared = false;
  /** @type {DeviceHead | null} */
  #ownHead = null;
  /** @type {Promise<SyncResult> | null} */
  #current = null;
  #again = false;
  #republished = false;

  /**
   * @param {{
   *   db: Db,
   *   recorder: ChangeRecorder,
   *   transport: SyncTransport,
   *   deviceId: string,
   *   getDeviceName: () => Promise<string>,
   *   afterPull: () => Promise<void>,
   *   changeFeed: ChangeFeed,
   *   nowIso: () => string,
   * }} deps
   */
  constructor({ db, recorder, transport, deviceId, getDeviceName, afterPull, changeFeed, nowIso }) {
    this.#db = db;
    this.#recorder = recorder;
    this.#transport = transport;
    this.#deviceId = deviceId;
    this.#getDeviceName = getDeviceName;
    this.#afterPull = afterPull;
    this.#changeFeed = changeFeed;
    this.#nowIso = nowIso;
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
      } finally {
        this.#current = null;
      }
    })();
    return this.#current;
  }

  /** @returns {Promise<SyncResult>} */
  async #cycle() {
    await this.#prepare();
    const pull = await this.#pull();
    const pushed = await this.#push();
    return { ...pull, pushed };
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

  /** @returns {Promise<Omit<SyncResult, 'pushed'>>} */
  async #pull() {
    const entries = await this.#transport.list('devices');
    const cursorRows = /** @type {{ deviceId: string, lastSeq: number }[]} */ (
      await this.#db.getAll(STORES.syncCursors)
    );
    const cursors = new Map(cursorRows.map((row) => [row.deviceId, row.lastSeq]));
    /** @type {Set<EntityName>} */
    const changed = new Set();
    /** @type {string[]} */
    const issues = [];
    let pulled = 0;
    let deferred = 0;

    const remoteIds = entries
      .filter((e) => e.isCollection && e.name !== this.#deviceId)
      .map((e) => e.name)
      .sort();
    for (const remoteId of remoteIds) {
      const headText = await this.#transport.get(`devices/${remoteId}/head.json`);
      if (headText === null) continue;
      const head = parseHead(parseJson(headText), remoteId);
      if (!head) {
        issues.push(`devices/${remoteId}/head.json is malformed`);
        continue;
      }
      let cursor = cursors.get(remoteId) ?? 0;
      if (head.lastSeq <= cursor) continue;
      for (const segment of head.segments) {
        if (segment.endSeq <= cursor) continue;
        const path = `devices/${remoteId}/ops/${segment.file}`;
        const text = await this.#transport.get(path);
        const parsed = parseSegment(parseJson(text), { deviceId: remoteId, ...segment });
        if (!parsed.ok) {
          issues.push(`${path}: ${text === null ? 'missing' : parsed.reason}`);
          break;
        }
        const fresh = parsed.ops.filter((op) => op.seq > cursor);
        const result = await this.#recorder.applyRemote(fresh, {
          deviceId: remoteId,
          lastSeq: segment.endSeq,
        });
        for (const entity of result.changed) changed.add(entity);
        pulled += fresh.length;
        deferred += result.deferred;
        cursor = segment.endSeq;
      }
    }

    await this.#afterPull();
    if (changed.size > 0) this.#changeFeed.publish({ entities: [...changed], source: 'remote' });
    return { pulled, deferred, issues };
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

  /**
   * Publishes outbox ops in segments: segment PUT, then head PUT, then outbox trim.
   * @returns {Promise<number>} ops published
   */
  async #push() {
    let head = await this.#loadOwnHead();
    let pushed = 0;
    for (;;) {
      const ops = /** @type {Op[]} */ (await this.#db.getAll(STORES.outbox, null, SEGMENT_SIZE));
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
      }
      const endSeq = ops[ops.length - 1].seq;
      const file = segmentFileName(startSeq, endSeq);
      await this.#transport.put(`${this.#ownDir}/ops/${file}`, JSON.stringify(ops));
      /** @type {DeviceHead} */
      const next = {
        deviceId: this.#deviceId,
        deviceName: await this.#getDeviceName(),
        lastSeq: endSeq,
        segments: [...head.segments, { file, startSeq, endSeq }],
        updatedAt: this.#nowIso(),
      };
      await this.#transport.put(`${this.#ownDir}/head.json`, JSON.stringify(next));
      this.#ownHead = next;
      head = next;
      await this.#trimOutbox(endSeq);
      pushed += ops.length;
    }
    return pushed;
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
