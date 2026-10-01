import { detectPlatform } from './platform.js';

/** @typedef {import('../../core/ports/installEnvironment.js').InstallOutcome} InstallOutcome */
/** @typedef {import('../../core/ports/installEnvironment.js').Platform} Platform */
/** @typedef {import('../../core/ports/installEnvironment.js').StorageProtection} StorageProtection */
/** @typedef {import('../../core/ports/installEnvironment.js').StorageEstimate} StorageEstimate */

/**
 * Chromium's install prompt event (not in the standard DOM typings).
 * @typedef {Event & {
 *   prompt: () => Promise<unknown>,
 *   userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>,
 * }} BeforeInstallPromptEvent
 */

/**
 * The parts of `navigator.storage` this adapter uses.
 * @typedef {object} StorageManagerLike
 * @property {() => Promise<boolean>} [persisted]
 * @property {() => Promise<boolean>} [persist]
 * @property {() => Promise<{ usage?: number, quota?: number }>} [estimate]
 */

/**
 * The parts of `window` this adapter uses, so tests can pass a fake.
 * @typedef {Pick<Window, 'addEventListener' | 'removeEventListener' | 'matchMedia'> & {
 *   navigator: import('./platform.js').NavigatorLike & {
 *     standalone?: boolean,
 *     storage?: StorageManagerLike,
 *   },
 * }} InstallWindow
 */

const STANDALONE_QUERY = '(display-mode: standalone)';

/**
 * Runs an optional async storage call, mapping "unsupported" (undefined) and failures to null.
 * @template T
 * @param {() => Promise<T> | undefined} call
 * @returns {Promise<T | null>}
 */
async function optional(call) {
  try {
    return (await call()) ?? null;
  } catch {
    return null;
  }
}

/**
 * Implements the `InstallEnvironment` port on browser APIs: `beforeinstallprompt` (kept for later),
 * `appinstalled`, the `display-mode` media query plus iOS `navigator.standalone`, and
 * `navigator.storage`. Construct it early so a `beforeinstallprompt` fired during startup is caught.
 */
export class BrowserInstallEnvironment {
  #window;
  /** @type {BeforeInstallPromptEvent | null} */
  #deferredPrompt = null;
  /** @type {MediaQueryList | null} */
  #standaloneQuery;
  /** @type {Set<(available: boolean) => void>} */
  #availabilityListeners = new Set();
  /** @type {Set<() => void>} */
  #installedListeners = new Set();
  /** @type {Platform} */
  platform;
  /** @type {StorageProtection} */
  storage;

  /** @param {{ window: InstallWindow }} deps */
  constructor({ window }) {
    this.#window = window;
    this.platform = detectPlatform(window.navigator);
    this.#standaloneQuery =
      typeof window.matchMedia === 'function' ? window.matchMedia(STANDALONE_QUERY) : null;
    window.addEventListener('beforeinstallprompt', this.#onBeforeInstallPrompt);
    window.addEventListener('appinstalled', this.#onAppInstalled);

    /** @returns {StorageManagerLike | undefined} */
    const storage = () => window.navigator.storage;
    this.storage = {
      persisted: () => optional(() => storage()?.persisted?.()),
      persist: () => optional(() => storage()?.persist?.()),
      estimate: async () => {
        const estimate = await optional(() => storage()?.estimate?.());
        if (!estimate || typeof estimate.usage !== 'number' || typeof estimate.quota !== 'number') {
          return null;
        }
        return { usage: estimate.usage, quota: estimate.quota };
      },
    };
  }

  /** @param {Event} event */
  #onBeforeInstallPrompt = (event) => {
    // Keep the event so the app can offer "Install" itself instead of the browser's mini-infobar.
    event.preventDefault();
    this.#deferredPrompt = /** @type {BeforeInstallPromptEvent} */ (event);
    for (const listener of this.#availabilityListeners) listener(true);
  };

  #onAppInstalled = () => {
    this.#clearPrompt();
    for (const listener of this.#installedListeners) listener();
  };

  /** @returns {void} */
  #clearPrompt() {
    if (this.#deferredPrompt === null) return;
    this.#deferredPrompt = null;
    for (const listener of this.#availabilityListeners) listener(false);
  }

  /** @returns {boolean} */
  isStandalone() {
    return this.#standaloneQuery?.matches === true || this.#window.navigator.standalone === true;
  }

  /**
   * @param {(standalone: boolean) => void} listener
   * @returns {() => void}
   */
  onDisplayModeChange(listener) {
    const query = this.#standaloneQuery;
    if (!query) return () => {};
    const handler = () => listener(this.isStandalone());
    query.addEventListener('change', handler);
    return () => query.removeEventListener('change', handler);
  }

  /** @returns {boolean} */
  canPromptInstall() {
    return this.#deferredPrompt !== null;
  }

  /**
   * @param {(available: boolean) => void} listener
   * @returns {() => void}
   */
  onInstallAvailabilityChange(listener) {
    this.#availabilityListeners.add(listener);
    return () => this.#availabilityListeners.delete(listener);
  }

  /**
   * Shows the browser's install prompt. A prompt event can be used once, so it is dropped after.
   * @returns {Promise<InstallOutcome>}
   */
  async promptInstall() {
    const prompt = this.#deferredPrompt;
    if (!prompt) return 'unavailable';
    try {
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      return outcome === 'accepted' ? 'accepted' : 'dismissed';
    } catch {
      return 'unavailable';
    } finally {
      this.#clearPrompt();
    }
  }

  /**
   * @param {() => void} listener
   * @returns {() => void}
   */
  onInstalled(listener) {
    this.#installedListeners.add(listener);
    return () => this.#installedListeners.delete(listener);
  }

  /**
   * Removes the window listeners.
   * @returns {void}
   */
  dispose() {
    this.#window.removeEventListener('beforeinstallprompt', this.#onBeforeInstallPrompt);
    this.#window.removeEventListener('appinstalled', this.#onAppInstalled);
    this.#availabilityListeners.clear();
    this.#installedListeners.clear();
  }
}
