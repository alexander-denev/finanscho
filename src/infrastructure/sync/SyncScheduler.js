/**
 * Decides when sync runs and exposes sync state. Implements the `SyncControl` port.
 * Triggers: start, resume, 5 s after the last local write, every 5 minutes in the foreground,
 * and "Sync now". Transient failures back off exponentially (capped at 5 minutes).
 */

import { SyncError } from '../../core/errors.js';
import { debounce } from '../../shared/debounce.js';
import { VAULT_FORMAT } from './SyncEngine.js';

/** @typedef {import('../../core/ports/syncTransport.js').SyncStatus} SyncStatus */
/** @typedef {import('../../core/ports/credentialStore.js').WebDavCredentials} WebDavCredentials */
/** @typedef {import('../../core/ports/credentialStore.js').CredentialStore} CredentialStore */
/** @typedef {import('../../core/ports/changeFeed.js').ChangeFeed} ChangeFeed */
/** @typedef {import('../../core/ports/repositories.js').SettingsRepository} SettingsRepository */
/** @typedef {import('../../core/errors.js').SyncFailureReason} SyncFailureReason */
/** @typedef {import('./SyncEngine.js').SyncResult} SyncResult */

export const DEBOUNCE_MS = 5_000;
export const INTERVAL_MS = 5 * 60_000;
export const BACKOFF_BASE_MS = 5_000;
export const BACKOFF_MAX_MS = 5 * 60_000;

const LAST_SYNCED_KEY = 'lastSyncedAt';
const SYNCED_VAULT_KEY = 'syncedVault';

/**
 * @typedef {object} Timers
 * @property {typeof setTimeout} setTimeout
 * @property {typeof clearTimeout} clearTimeout
 * @property {typeof setInterval} setInterval
 * @property {typeof clearInterval} clearInterval
 */

/**
 * @typedef {object} SchedulerDeps
 * @property {CredentialStore} credentials
 * @property {SettingsRepository} settings
 * @property {ChangeFeed} changeFeed
 * @property {(credentials: WebDavCredentials) => { sync: () => Promise<SyncResult> }} createEngine
 * @property {(credentials: WebDavCredentials) => { checkAccess: () => Promise<void>, get: (path: string) => Promise<string | null> }} createClient
 * @property {() => Promise<unknown>} onVaultChange re-queue all data before syncing with a different vault
 * @property {{ onResume: (fn: () => void) => () => void, onPause: (fn: () => void) => () => void }} lifecycle
 * @property {() => string} nowIso
 * @property {Timers} [timers]
 */

/**
 * Stable identity of a vault (server URL + vault path), used to detect a vault change.
 * @param {WebDavCredentials} credentials
 * @returns {string}
 */
export function vaultIdentity(credentials) {
  const url = credentials.url.trim().replace(/\/+$/, '').toLowerCase();
  const path = credentials.vaultPath.trim().replace(/^\/+|\/+$/g, '');
  return `${url}/${path}`;
}

/**
 * @param {unknown} error
 * @returns {SyncFailureReason}
 */
function reasonOf(error) {
  return error instanceof SyncError ? error.reason : 'unknown';
}

/** Sync trigger policy and observable status. */
export class SyncScheduler {
  #deps;
  #timers;
  /** @type {{ sync: () => Promise<SyncResult> } | null} */
  #engine = null;
  /** @type {SyncStatus} */
  #status = {
    state: 'disabled',
    reason: null,
    lastSyncedAt: null,
    deferredOps: 0,
    issues: 0,
    cleanupBlocked: false,
  };
  /** @type {Set<(status: SyncStatus) => void>} */
  #listeners = new Set();
  /** @type {Array<() => void>} */
  #cleanups = [];
  /** @type {ReturnType<typeof setInterval> | undefined} */
  #interval;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  #retry;
  #failures = 0;
  #debounced;

  /** @param {SchedulerDeps} deps */
  constructor(deps) {
    this.#deps = deps;
    this.#timers = deps.timers ?? globalThis;
    this.#debounced = debounce(() => void this.syncNow(), DEBOUNCE_MS, this.#timers);
  }

  /**
   * Loads the configuration, subscribes to triggers, and runs the first cycle when configured.
   * @returns {Promise<void>}
   */
  async start() {
    const [credentials, lastSyncedAt] = await Promise.all([
      this.#deps.credentials.load(),
      this.#deps.settings.get(LAST_SYNCED_KEY),
    ]);
    this.#update({ lastSyncedAt: typeof lastSyncedAt === 'string' ? lastSyncedAt : null });
    this.#cleanups.push(
      this.#deps.changeFeed.subscribe((event) => {
        if (event.source === 'local' && this.#engine) this.#debounced.trigger();
      }),
      this.#deps.lifecycle.onResume(() => {
        if (!this.#engine) return;
        this.#startInterval();
        void this.syncNow();
      }),
      this.#deps.lifecycle.onPause(() => this.#stopInterval()),
    );
    if (credentials) await this.#activate(credentials);
  }

  /**
   * Stops all timers and listeners.
   * @returns {void}
   */
  stop() {
    for (const cleanup of this.#cleanups.splice(0)) cleanup();
    this.#debounced.cancel();
    this.#stopInterval();
    this.#clearRetry();
  }

  /** @returns {SyncStatus} */
  getStatus() {
    return this.#status;
  }

  /**
   * @param {(status: SyncStatus) => void} listener
   * @returns {() => void}
   */
  subscribe(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** @returns {Promise<WebDavCredentials | null>} */
  getConfig() {
    return this.#deps.credentials.load();
  }

  /**
   * Saves (or clears) the WebDAV configuration. Switching to a different vault re-queues all
   * local data so the new vault receives everything.
   * @param {WebDavCredentials | null} credentials
   * @returns {Promise<void>}
   */
  async configure(credentials) {
    if (credentials === null) {
      await this.#deps.credentials.clear();
      this.#engine = null;
      this.#debounced.cancel();
      this.#stopInterval();
      this.#clearRetry();
      this.#update({
        state: 'disabled',
        reason: null,
        deferredOps: 0,
        issues: 0,
        cleanupBlocked: false,
      });
      return;
    }
    const synced = await this.#deps.settings.get(SYNCED_VAULT_KEY);
    if (typeof synced === 'string' && synced !== vaultIdentity(credentials)) {
      await this.#deps.onVaultChange();
      await this.#deps.settings.set(SYNCED_VAULT_KEY, null);
    }
    await this.#deps.credentials.save(credentials);
    await this.#activate(credentials);
  }

  /**
   * Checks reachability, credentials, and vault compatibility without writing anything.
   * @param {WebDavCredentials} credentials
   * @returns {Promise<{ ok: true } | { ok: false, reason: SyncFailureReason }>}
   */
  async testConnection(credentials) {
    try {
      const client = this.#deps.createClient(credentials);
      await client.checkAccess();
      const vault = await client.get('vault.json');
      if (vault !== null) {
        const format = /** @type {{ format?: unknown }} */ (JSON.parse(vault)).format;
        if (typeof format === 'number' && format > VAULT_FORMAT) {
          return { ok: false, reason: 'vaultTooNew' };
        }
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: error instanceof SyntaxError ? 'malformed' : reasonOf(error) };
    }
  }

  /**
   * Runs a sync cycle now (coalesced with a running one). Never rejects; failures go to status.
   * @returns {Promise<void>}
   */
  async syncNow() {
    const engine = this.#engine;
    if (!engine) return;
    this.#debounced.cancel();
    this.#clearRetry();
    this.#update({ state: 'syncing', reason: null });
    try {
      const result = await engine.sync();
      if (engine !== this.#engine) return;
      const now = this.#deps.nowIso();
      this.#failures = 0;
      await this.#deps.settings.set(LAST_SYNCED_KEY, now);
      const credentials = await this.#deps.credentials.load();
      if (credentials) await this.#deps.settings.set(SYNCED_VAULT_KEY, vaultIdentity(credentials));
      this.#update({
        state: 'idle',
        reason: null,
        lastSyncedAt: now,
        deferredOps: result.deferred,
        issues: result.issues.length,
        cleanupBlocked: result.cleanupBlocked,
      });
    } catch (error) {
      if (engine !== this.#engine) return;
      const reason = reasonOf(error);
      const transient = error instanceof SyncError && error.isTransient;
      this.#update({ state: reason === 'offline' ? 'offline' : 'error', reason });
      if (transient) this.#scheduleRetry();
    }
  }

  /**
   * @param {WebDavCredentials} credentials
   * @returns {Promise<void>}
   */
  async #activate(credentials) {
    this.#engine = this.#deps.createEngine(credentials);
    this.#failures = 0;
    this.#update({ state: 'idle', reason: null });
    this.#startInterval();
    await this.syncNow();
  }

  /** @returns {void} */
  #startInterval() {
    this.#stopInterval();
    this.#interval = this.#timers.setInterval(() => void this.syncNow(), INTERVAL_MS);
  }

  /** @returns {void} */
  #stopInterval() {
    if (this.#interval !== undefined) this.#timers.clearInterval(this.#interval);
    this.#interval = undefined;
  }

  /** @returns {void} */
  #scheduleRetry() {
    this.#failures += 1;
    const delay = Math.min(BACKOFF_BASE_MS * 2 ** (this.#failures - 1), BACKOFF_MAX_MS);
    this.#retry = this.#timers.setTimeout(() => {
      this.#retry = undefined;
      void this.syncNow();
    }, delay);
  }

  /** @returns {void} */
  #clearRetry() {
    if (this.#retry !== undefined) this.#timers.clearTimeout(this.#retry);
    this.#retry = undefined;
  }

  /**
   * @param {Partial<SyncStatus>} changes
   * @returns {void}
   */
  #update(changes) {
    this.#status = { ...this.#status, ...changes };
    for (const listener of this.#listeners) listener(this.#status);
  }
}
