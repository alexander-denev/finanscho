import { DEFAULT_CURRENCY, isCurrencyCode } from '../domain/money.js';
import { checkRequiredText, throwIfInvalid } from '../domain/validation.js';

/** @typedef {import('../ports/repositories.js').SettingsRepository} SettingsRepository */
/** @typedef {import('../ports/repositories.js').DeviceRepository} DeviceRepository */

export const THEMES = /** @type {const} */ (['system', 'light', 'dark']);

/** @typedef {(typeof THEMES)[number]} Theme */

/**
 * Device-local preferences.
 * @typedef {object} Settings
 * @property {string} defaultCurrency
 * @property {Theme} theme
 * @property {string} deviceName
 * @property {boolean} storageNoticeDismissed
 */

/** Keys in the settings repository. */
export const SETTING_KEYS = /** @type {const} */ ({
  defaultCurrency: 'defaultCurrency',
  theme: 'theme',
  storageNoticeDismissed: 'storageNoticeDismissed',
  lastAccountId: 'lastAccountId',
  categoriesSeeded: 'categoriesSeeded',
});

/** Use cases for device-local settings. */
export class SettingsService {
  #settings;
  #device;

  /** @param {{ settings: SettingsRepository, device: DeviceRepository }} deps */
  constructor({ settings, device }) {
    this.#settings = settings;
    this.#device = device;
  }

  /** @returns {Promise<Settings>} */
  async load() {
    const [currency, theme, dismissed, deviceName] = await Promise.all([
      this.#settings.get(SETTING_KEYS.defaultCurrency),
      this.#settings.get(SETTING_KEYS.theme),
      this.#settings.get(SETTING_KEYS.storageNoticeDismissed),
      this.#device.getDeviceName(),
    ]);
    return {
      defaultCurrency: isCurrencyCode(currency) ? currency : DEFAULT_CURRENCY,
      theme: THEMES.includes(/** @type {Theme} */ (theme))
        ? /** @type {Theme} */ (theme)
        : 'system',
      deviceName,
      storageNoticeDismissed: dismissed === true,
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

  /** @returns {Promise<void>} */
  async dismissStorageNotice() {
    await this.#settings.set(SETTING_KEYS.storageNoticeDismissed, true);
  }
}
