/**
 * Sync ports.
 *
 * `SyncTransport` is the remote file storage the sync engine talks to (implemented by
 * WebDavClient). `SyncControl` is what the state layer uses to observe and trigger sync
 * (implemented by SyncScheduler); stores never know how sync works.
 */

/** @typedef {import('../errors.js').SyncFailureReason} SyncFailureReason */
/** @typedef {import('./credentialStore.js').WebDavCredentials} WebDavCredentials */

/**
 * @typedef {object} RemoteEntry
 * @property {string} name last path segment, without trailing slash
 * @property {boolean} isCollection
 */

/**
 * Remote storage. Paths are relative to the vault root and use `/` separators. Methods throw
 * `SyncError` on failure.
 * @typedef {object} SyncTransport
 * @property {(path: string) => Promise<void>} ensureCollection create a folder, tolerating "already exists"
 * @property {(path: string) => Promise<string | null>} get file text, or null when absent
 * @property {(path: string, body: string) => Promise<void>} put
 * @property {(path: string) => Promise<RemoteEntry[]>} list direct children of a folder
 * @property {(path: string) => Promise<void>} delete remove a file, or a folder and everything in it when `path` ends with `/`; succeeds when already absent
 */

/**
 * @typedef {object} SyncStatus
 * @property {'disabled' | 'idle' | 'syncing' | 'offline' | 'error'} state
 * @property {SyncFailureReason | null} reason set when state is 'error' or 'offline'
 * @property {string | null} lastSyncedAt ISO time of the last successful cycle
 * @property {number} deferredOps remote changes from the last cycle that need a newer app version
 * @property {number} issues malformed remote files skipped in the last cycle
 * @property {boolean} cleanupBlocked the server refused to delete superseded files (usually CORS without DELETE); sync itself works
 */

/**
 * @typedef {object} SyncControl
 * @property {() => SyncStatus} getStatus
 * @property {(listener: (status: SyncStatus) => void) => () => void} subscribe
 * @property {() => Promise<void>} syncNow run a cycle now (coalesced with a running one)
 * @property {() => Promise<WebDavCredentials | null>} getConfig
 * @property {(credentials: WebDavCredentials | null) => Promise<void>} configure save (or clear) credentials and start/stop syncing
 * @property {(credentials: WebDavCredentials) => Promise<{ ok: true } | { ok: false, reason: SyncFailureReason }>} testConnection
 */

export {};
