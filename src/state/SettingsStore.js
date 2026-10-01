import { signal } from '@preact/signals-core';
import { createLoadState } from './loadState.js';

/** @typedef {import('../core/services/SettingsService.js').SettingsService} SettingsService */
/** @typedef {import('../core/services/SettingsService.js').Settings} Settings */
/** @typedef {import('../core/services/BackupService.js').BackupService} BackupService */
/** @typedef {import('../core/ports/changeFeed.js').ChangedEntity} ChangedEntity */

/**
 * @template T
 * @typedef {import('@preact/signals-core').ReadonlySignal<T>} ReadonlySignal
 */

/** @type {Settings} */
const DEFAULTS = {
  defaultCurrency: 'EUR',
  theme: 'system',
  deviceName: '',
};

/** Device-local preferences and backup export/import. */
export class SettingsStore {
  /** @type {ReadonlyArray<ChangedEntity>} */
  static DEPENDS_ON = [];

  #settings;
  #backup;
  #values = signal(DEFAULTS);
  #load = createLoadState();

  /** @param {{ settingsService: SettingsService, backupService: BackupService }} deps */
  constructor({ settingsService, backupService }) {
    this.#settings = settingsService;
    this.#backup = backupService;
  }

  /** @returns {ReadonlySignal<Settings>} */
  get values() {
    return this.#values;
  }

  /** @returns {ReadonlySignal<import('./loadState.js').LoadStatus>} */
  get status() {
    return this.#load.status;
  }

  /** @returns {ReadonlySignal<unknown>} */
  get error() {
    return this.#load.error;
  }

  /** @returns {Promise<void>} */
  load() {
    return this.#load.run(
      () => this.#settings.load(),
      (values) => {
        this.#values.value = values;
      },
    );
  }

  /** @returns {Promise<void>} */
  invalidate() {
    return this.load();
  }

  /** @returns {Promise<void>} */
  settled() {
    return this.#load.settled();
  }

  /**
   * @param {string} theme
   * @returns {Promise<void>}
   */
  async setTheme(theme) {
    await this.#settings.setTheme(theme);
    await this.load();
  }

  /**
   * @param {string} currency
   * @returns {Promise<void>}
   */
  async setDefaultCurrency(currency) {
    await this.#settings.setDefaultCurrency(currency);
    await this.load();
  }

  /**
   * @param {string} name
   * @returns {Promise<void>}
   */
  async setDeviceName(name) {
    await this.#settings.setDeviceName(name);
    await this.load();
  }

  /** @returns {Promise<{ fileName: string, json: string }>} */
  async exportBackup() {
    return { fileName: this.#backup.fileName(), json: await this.#backup.exportJson() };
  }

  /**
   * @param {string} text backup file contents
   * @returns {Promise<number>} records changed
   */
  importBackup(text) {
    return this.#backup.importJson(text);
  }
}
