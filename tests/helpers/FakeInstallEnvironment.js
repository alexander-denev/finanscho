/** @typedef {import('../../src/core/ports/installEnvironment.js').InstallEnvironment} InstallEnvironment */

/**
 * Controllable `InstallEnvironment` for tests: set the platform, standalone state, prompt
 * availability, the user's choice in the install prompt, and what `navigator.storage` answers.
 * @implements {InstallEnvironment}
 */
export class FakeInstallEnvironment {
  /** @type {import('../../src/core/ports/installEnvironment.js').Platform} */
  platform;
  standalone = false;
  promptAvailable = false;
  /** @type {'accepted' | 'dismissed'} */
  userChoice = 'accepted';
  /** @type {boolean | null} */
  persistedValue = false;
  /** @type {boolean | null} what persist() grants */
  persistGrant = true;
  /** @type {{ usage: number, quota: number } | null} */
  estimateValue = { usage: 2_500_000, quota: 1_000_000_000 };
  /** @type {string[]} */
  calls = [];
  /** @type {Set<(standalone: boolean) => void>} */
  #displayListeners = new Set();
  /** @type {Set<(available: boolean) => void>} */
  #availabilityListeners = new Set();
  /** @type {Set<() => void>} */
  #installedListeners = new Set();

  /** @param {Partial<import('../../src/core/ports/installEnvironment.js').Platform>} [platform] */
  constructor(platform = {}) {
    this.platform = { os: 'desktop', browser: 'chromium', ...platform };
    this.storage = {
      persisted: async () => {
        this.calls.push('persisted');
        return this.persistedValue;
      },
      persist: async () => {
        this.calls.push('persist');
        if (this.persistGrant === true) this.persistedValue = true;
        return this.persistGrant;
      },
      estimate: async () => {
        this.calls.push('estimate');
        return this.estimateValue;
      },
    };
  }

  isStandalone() {
    return this.standalone;
  }

  /** @param {(standalone: boolean) => void} listener */
  onDisplayModeChange(listener) {
    this.#displayListeners.add(listener);
    return () => this.#displayListeners.delete(listener);
  }

  canPromptInstall() {
    return this.promptAvailable;
  }

  /** @param {(available: boolean) => void} listener */
  onInstallAvailabilityChange(listener) {
    this.#availabilityListeners.add(listener);
    return () => this.#availabilityListeners.delete(listener);
  }

  /** @returns {Promise<'accepted' | 'dismissed' | 'unavailable'>} */
  async promptInstall() {
    this.calls.push('promptInstall');
    if (!this.promptAvailable) return 'unavailable';
    this.setPromptAvailable(false);
    return this.userChoice;
  }

  /** @param {() => void} listener */
  onInstalled(listener) {
    this.#installedListeners.add(listener);
    return () => this.#installedListeners.delete(listener);
  }

  // --- Test controls ---------------------------------------------------------------------------

  /** @param {boolean} available */
  setPromptAvailable(available) {
    this.promptAvailable = available;
    for (const listener of this.#availabilityListeners) listener(available);
  }

  /** @param {boolean} standalone */
  setStandalone(standalone) {
    this.standalone = standalone;
    for (const listener of this.#displayListeners) listener(standalone);
  }

  /** Simulates the browser's `appinstalled` event. */
  fireInstalled() {
    for (const listener of this.#installedListeners) listener();
  }
}
