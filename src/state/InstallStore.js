import { batch, computed, signal } from '@preact/signals-core';
import { createLoadState } from './loadState.js';

/** @typedef {import('../core/ports/installEnvironment.js').InstallEnvironment} InstallEnvironment */
/** @typedef {import('../core/ports/installEnvironment.js').InstallOutcome} InstallOutcome */
/** @typedef {import('../core/ports/installEnvironment.js').Platform} Platform */
/** @typedef {import('../core/services/SettingsService.js').SettingsService} SettingsService */
/** @typedef {import('../core/services/SettingsService.js').InstallNoticeState} InstallNoticeState */
/** @typedef {import('../core/ports/changeFeed.js').ChangedEntity} ChangedEntity */

/**
 * @template T
 * @typedef {import('@preact/signals-core').ReadonlySignal<T>} ReadonlySignal
 */

/**
 * Which install instructions fit this browser:
 * - `prompt`: the browser offered its own install prompt;
 * - `iosSafari`: Share → Add to Home Screen;
 * - `iosOtherBrowser`: open the page in Safari first;
 * - `firefoxDesktop`: Firefox on the desktop cannot install web apps;
 * - `manual`: use the browser's menu.
 * @typedef {'prompt' | 'iosSafari' | 'iosOtherBrowser' | 'firefoxDesktop' | 'manual'} InstallGuidance
 */

/** The install recommendation stays hidden this long after "Not now". */
export const INSTALL_SNOOZE_MS = 14 * 86_400_000;
/** After this many "Not now"s the recommendation is not shown again (Settings still offers it). */
export const INSTALL_MAX_DISMISSALS = 3;

/**
 * @typedef {object} InstallStoreDeps
 * @property {InstallEnvironment} environment
 * @property {SettingsService} settingsService
 * @property {{ items: ReadonlySignal<ReadonlyArray<unknown>> }} accountsStore
 * @property {{ items: ReadonlySignal<ReadonlyArray<unknown>> }} transactionsStore
 * @property {{ nowMs: () => number }} clock
 */

/**
 * Install status, the install recommendation, and storage protection (persistence and usage).
 * See docs/DECISIONS.md, D38.
 */
export class InstallStore {
  /** @type {ReadonlyArray<ChangedEntity>} */
  static DEPENDS_ON = [];

  #environment;
  #settings;
  #clock;
  #installed;
  #canPrompt;
  #persisted = signal(/** @type {boolean | null} */ (null));
  #usage = signal(/** @type {number | null} */ (null));
  #quota = signal(/** @type {number | null} */ (null));
  #notice = signal(/** @type {InstallNoticeState} */ ({ dismissedAt: null, dismissCount: 0 }));
  #load = createLoadState();
  #hasData;
  #guidance;
  #showBanner;
  #showFreshInstallHint;
  /** @type {Array<() => void>} */
  #unsubscribe;

  /** @param {InstallStoreDeps} deps */
  constructor({ environment, settingsService, accountsStore, transactionsStore, clock }) {
    this.#environment = environment;
    this.#settings = settingsService;
    this.#clock = clock;
    this.#installed = signal(environment.isStandalone());
    this.#canPrompt = signal(environment.canPromptInstall());
    // Accounts are never seeded, so any account (or transaction) is the user's own data.
    this.#hasData = computed(
      () => accountsStore.items.value.length > 0 || transactionsStore.items.value.length > 0,
    );
    this.#guidance = computed(() => {
      if (this.#canPrompt.value) return /** @type {InstallGuidance} */ ('prompt');
      const { os, browser } = environment.platform;
      if (os === 'ios') return browser === 'safari' ? 'iosSafari' : 'iosOtherBrowser';
      if (os === 'desktop' && browser === 'firefox') return 'firefoxDesktop';
      return 'manual';
    });
    this.#showBanner = computed(() => {
      const { dismissedAt, dismissCount } = this.#notice.value;
      const snoozed =
        dismissedAt !== null && this.#clock.nowMs() < Date.parse(dismissedAt) + INSTALL_SNOOZE_MS;
      return (
        !this.#installed.value &&
        this.#hasData.value &&
        !snoozed &&
        dismissCount < INSTALL_MAX_DISMISSALS
      );
    });
    // A home-screen app on iOS starts with empty storage, separate from Safari's.
    this.#showFreshInstallHint = computed(
      () => this.#installed.value && environment.platform.os === 'ios' && !this.#hasData.value,
    );
    this.#unsubscribe = [
      environment.onDisplayModeChange((standalone) => {
        this.#installed.value = standalone;
      }),
      environment.onInstallAvailabilityChange((available) => {
        this.#canPrompt.value = available;
      }),
      environment.onInstalled(() => {
        this.#installed.value = true;
        void this.#protect();
      }),
    ];
  }

  /** @returns {ReadonlySignal<boolean>} running as an installed app */
  get installed() {
    return this.#installed;
  }

  /** @returns {ReadonlySignal<boolean>} the browser's own install prompt is available */
  get canPrompt() {
    return this.#canPrompt;
  }

  /** @returns {ReadonlySignal<InstallGuidance>} */
  get guidance() {
    return this.#guidance;
  }

  /** @returns {ReadonlySignal<boolean | null>} storage is persistent (null: unknown or unsupported) */
  get persisted() {
    return this.#persisted;
  }

  /** @returns {ReadonlySignal<number | null>} bytes used by the app, when known */
  get usage() {
    return this.#usage;
  }

  /** @returns {ReadonlySignal<number | null>} bytes the app may use, when known */
  get quota() {
    return this.#quota;
  }

  /** @returns {ReadonlySignal<boolean>} recommend installing (not installed, real data, not snoozed) */
  get showBanner() {
    return this.#showBanner;
  }

  /** @returns {ReadonlySignal<boolean>} freshly installed on iOS with no data: point to import/sync */
  get showFreshInstallHint() {
    return this.#showFreshInstallHint;
  }

  /** @returns {Platform} */
  get platform() {
    return this.#environment.platform;
  }

  /** @returns {ReadonlySignal<import('./loadState.js').LoadStatus>} */
  get status() {
    return this.#load.status;
  }

  /** @returns {ReadonlySignal<unknown>} */
  get error() {
    return this.#load.error;
  }

  /**
   * Reads the snooze state, whether storage is persistent, and the usage estimate.
   * @returns {Promise<void>}
   */
  load() {
    return this.#load.run(
      () =>
        Promise.all([
          this.#settings.loadInstallNotice(),
          this.#environment.storage.persisted(),
          this.#environment.storage.estimate(),
        ]),
      ([notice, persisted, estimate]) => {
        this.#notice.value = notice;
        this.#persisted.value = persisted;
        this.#usage.value = estimate?.usage ?? null;
        this.#quota.value = estimate?.quota ?? null;
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
   * Asks for persistent storage without a user gesture, but only where that never shows a
   * permission prompt: when installed, and in Chromium and Safari. Firefox prompts, so it waits
   * for "Protect my data".
   * @returns {Promise<void>}
   */
  async protectSilently() {
    if (this.#persisted.value === true) return;
    const { browser } = this.#environment.platform;
    if (this.#installed.value || browser === 'chromium' || browser === 'safari') {
      await this.#protect();
    }
  }

  /**
   * Asks for persistent storage. Call it from a user gesture (Firefox requires one).
   * @returns {Promise<void>}
   */
  requestPersistence() {
    return this.#protect();
  }

  /**
   * Shows the browser's install prompt; asks for persistent storage when the user accepts.
   * @returns {Promise<InstallOutcome>}
   */
  async install() {
    const outcome = await this.#environment.promptInstall();
    if (outcome === 'accepted') await this.#protect();
    return outcome;
  }

  /**
   * "Not now": hides the recommendation for two weeks and counts the dismissal.
   * @returns {Promise<void>}
   */
  async dismiss() {
    this.#notice.value = await this.#settings.dismissInstallNotice();
  }

  /** @returns {Promise<void>} */
  async refreshEstimate() {
    const estimate = await this.#environment.storage.estimate();
    batch(() => {
      this.#usage.value = estimate?.usage ?? null;
      this.#quota.value = estimate?.quota ?? null;
    });
  }

  /** @returns {Promise<void>} */
  async #protect() {
    const granted = await this.#environment.storage.persist();
    // persist() resolves false when denied; keep a known "true" from persisted() over an unknown.
    if (granted !== null || this.#persisted.value === null) this.#persisted.value = granted;
    await this.refreshEstimate();
  }

  /**
   * Stops listening to the install environment.
   * @returns {void}
   */
  dispose() {
    for (const unsubscribe of this.#unsubscribe.splice(0)) unsubscribe();
  }
}
