import { batch, signal } from '@preact/signals-core';
import { createLoadState } from './loadState.js';

/** @typedef {import('../core/ports/syncTransport.js').SyncControl} SyncControl */
/** @typedef {import('../core/ports/syncTransport.js').SyncStatus} SyncStatus */
/** @typedef {import('../core/ports/syncTransport.js').DeviceInfo} DeviceInfo */
/** @typedef {import('../core/ports/credentialStore.js').WebDavCredentials} WebDavCredentials */
/** @typedef {import('../core/errors.js').SyncFailureReason} SyncFailureReason */
/** @typedef {import('../core/ports/changeFeed.js').ChangedEntity} ChangedEntity */

/**
 * @template T
 * @typedef {import('@preact/signals-core').ReadonlySignal<T>} ReadonlySignal
 */

/** Observable sync state and sync configuration actions. */
export class SyncStore {
  /** @type {ReadonlyArray<ChangedEntity>} */
  static DEPENDS_ON = [];

  #control;
  #syncStatus;
  #devices;
  #config = signal(/** @type {WebDavCredentials | null} */ (null));
  #load = createLoadState();
  /** @type {() => void} */
  #unsubscribe;

  /** @param {{ syncControl: SyncControl }} deps */
  constructor({ syncControl }) {
    this.#control = syncControl;
    this.#syncStatus = signal(syncControl.getStatus());
    this.#devices = signal(syncControl.listDevices());
    this.#unsubscribe = syncControl.subscribe((status) => {
      batch(() => {
        this.#syncStatus.value = status;
        this.#devices.value = syncControl.listDevices();
      });
    });
  }

  /** @returns {ReadonlySignal<WebDavCredentials | null>} the saved configuration */
  get config() {
    return this.#config;
  }

  /** @returns {ReadonlySignal<import('./loadState.js').LoadStatus>} loading state of the configuration */
  get status() {
    return this.#load.status;
  }

  /** @returns {ReadonlySignal<unknown>} */
  get error() {
    return this.#load.error;
  }

  /** @returns {ReadonlySignal<SyncStatus>} live sync state (idle, syncing, offline, error) */
  get syncStatus() {
    return this.#syncStatus;
  }

  /** @returns {ReadonlySignal<DeviceInfo[]>} devices in the vault as of the last cycle, this device first */
  get devices() {
    return this.#devices;
  }

  /** @returns {Promise<void>} */
  load() {
    return this.#load.run(
      () => this.#control.getConfig(),
      (config) => {
        this.#config.value = config;
      },
    );
  }

  /** @returns {Promise<void>} */
  invalidate() {
    return this.load();
  }

  /** @returns {Promise<void>} */
  syncNow() {
    return this.#control.syncNow();
  }

  /**
   * Saves (or clears with null) the WebDAV configuration and starts syncing.
   * @param {WebDavCredentials | null} credentials
   * @returns {Promise<void>}
   */
  async configure(credentials) {
    await this.#control.configure(credentials);
    await this.load();
  }

  /**
   * @param {WebDavCredentials} credentials
   * @returns {Promise<{ ok: true } | { ok: false, reason: SyncFailureReason }>}
   */
  testConnection(credentials) {
    return this.#control.testConnection(credentials);
  }

  /**
   * "Clean up server data". Never rejects; the outcome shows in `syncStatus`.
   * @returns {Promise<void>}
   */
  compactNow() {
    return this.#control.compactNow();
  }

  /**
   * Removes another device from the sync folder.
   * @param {string} deviceId
   * @returns {Promise<void>} rejects with a SyncError (for example `removeIncomplete`)
   */
  removeDevice(deviceId) {
    return this.#control.removeDevice(deviceId);
  }

  /**
   * Stops listening to the sync controller.
   * @returns {void}
   */
  dispose() {
    this.#unsubscribe();
  }
}
