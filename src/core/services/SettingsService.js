import { DEFAULT_CURRENCY, isCurrencyCode } from '../domain/money.js';
import { checkRequiredText, throwIfInvalid } from '../domain/validation.js';

/** @typedef {import('../ports/repositories.js').SettingsRepository} SettingsRepository */
/** @typedef {import('../ports/repositories.js').DeviceRepository} DeviceRepository */
/** @typedef {import('../ports/clock.js').Clock} Clock */

export const THEMES = /** @type {const} */ (['system', 'light', 'dark']);

/** @typedef {(typeof THEMES)[number]} Theme */

/**
 * Device-local preferences.
 * @typedef {object} Settings
 * @property {string} defaultCurrency
 * @property {Theme} theme
 * @property {string} deviceName
 */

/**
 * When the user last snoozed the install recommendation, and how often.
 * @typedef {object} InstallNoticeState
 * @property {string | null} dismissedAt ISO time of the last "Not now"
 * @property {number} dismissCount
 */

/** Keys in the settings repository. */
export const SETTING_KEYS = /** @type {const} */ ({
  defaultCurrency: 'defaultCurrency',
  theme: 'theme',
  installNoticeDismissedAt: 'installNoticeDismissedAt',
  installNoticeDismissCount: 'installNoticeDismissCount',
  lastAccountId: 'lastAccountId',
  categoriesSeeded: 'categoriesSeeded',
});

/** Use cases for device-local settings. */
export class SettingsService {
  #settings;
  #device;
  #clock;

  /** @param {{ settings: SettingsRepository, device: DeviceRepository, clock: Clock }} deps */
  constructor({ settings, device, clock }) {
    this.#settings = settings;
    this.#device = device;
    this.#clock = clock;
  }

  /** @returns {Promise<Settings>} */
  async load() {
    const [currency, theme, deviceName] = await Promise.all([
      this.#settings.get(SETTING_KEYS.defaultCurrency),
      this.#settings.get(SETTING_KEYS.theme),
      this.#device.getDeviceName(),
    ]);
    return {
      defaultCurrency: isCurrencyCode(currency) ? currency : DEFAULT_CURRENCY,
      theme: THEMES.includes(/** @type {Theme} */ (theme))
        ? /** @type {Theme} */ (theme)
        : 'system',
      deviceName,
    };
  }

  /**
   * @param {string} currency
   * @returns {Promise<void>}
   */
  async setDefaultCurrency(currency) {
    const code = currency.toUpperCase();
    throwIfInvalid({ defaultCurrency: isCurrencyCode(code) ? null : 'validation.currency' });
    await this.#settings.set(SETTING_KEYS.defaultCurrency, code);
  }

  /**
   * @param {string} theme
   * @returns {Promise<void>}
   */
  async setTheme(theme) {
    throwIfInvalid({
      theme: THEMES.includes(/** @type {Theme} */ (theme)) ? null : 'validation.invalid',
    });
    await this.#settings.set(SETTING_KEYS.theme, theme);
  }

  /**
   * @param {string} name
   * @returns {Promise<void>}
   */
  async setDeviceName(name) {
    throwIfInvalid({ deviceName: checkRequiredText(name) });
    await this.#device.setDeviceName(name.trim());
  }

  /** @returns {Promise<InstallNoticeState>} */
  async loadInstallNotice() {
    const [dismissedAt, dismissCount] = await Promise.all([
      this.#settings.get(SETTING_KEYS.installNoticeDismissedAt),
      this.#settings.get(SETTING_KEYS.installNoticeDismissCount),
    ]);
    return {
      dismissedAt: typeof dismissedAt === 'string' ? dismissedAt : null,
      dismissCount:
        typeof dismissCount === 'number' && Number.isSafeInteger(dismissCount) && dismissCount > 0
          ? dismissCount
          : 0,
    };
  }

  /**
   * Snoozes the install recommendation from now and counts the dismissal.
   * @returns {Promise<InstallNoticeState>} the new state
   */
  async dismissInstallNotice() {
    const { dismissCount } = await this.loadInstallNotice();
    const next = { dismissedAt: this.#clock.nowIso(), dismissCount: dismissCount + 1 };
    await this.#settings.set(SETTING_KEYS.installNoticeDismissedAt, next.dismissedAt);
    await this.#settings.set(SETTING_KEYS.installNoticeDismissCount, next.dismissCount);
    return next;
  }
}
