/**
 * Translation and formatting helpers. v1 ships English strings; numbers, money, and dates are
 * formatted with `Intl` in the user's locale.
 */

import { formatMoney as formatMoneyDomain } from '../../core/domain/money.js';
import { EN } from './en.js';

/** @typedef {Record<string, string | number>} Params */

/**
 * The user's locale, read from the browser each call (no module state).
 * @returns {string}
 */
export function getLocale() {
  const language = globalThis.navigator?.language;
  return typeof language === 'string' && language !== '' ? language : 'en-US';
}

/**
 * Translates a key, filling `{placeholders}` from params. Unknown keys return the key itself so
 * missing strings are visible in development and tests.
 * @param {string} key
 * @param {Params} [params]
 * @returns {string}
 */
export function t(key, params = {}) {
  const template = EN[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    name in params ? String(params[name]) : match,
  );
}

/**
 * Whether a translation exists for a key.
 * @param {string} key
 * @returns {boolean}
 */
export function hasTranslation(key) {
  return key in EN;
}

/**
 * @param {number} minor
 * @param {string} currency
 * @param {{ signDisplay?: 'auto' | 'always' | 'exceptZero' | 'never' }} [options]
 * @returns {string}
 */
export function formatMoney(minor, currency, options) {
  return formatMoneyDomain(minor, currency, getLocale(), options);
}

/**
 * Formats a local calendar date. The date is interpreted in UTC purely as a calendar value so it
 * never shifts by a day in any time zone.
 * @param {string} date 'YYYY-MM-DD'
 * @param {'long' | 'medium' | 'short' | 'weekday'} [style]
 * @returns {string}
 */
export function formatDate(date, style = 'medium') {
  const [y, m, d] = date.split('-').map(Number);
  const value = new Date(Date.UTC(y, m - 1, d));
  /** @type {Intl.DateTimeFormatOptions} */
  const options =
    style === 'long'
      ? { dateStyle: 'full' }
      : style === 'short'
        ? { day: 'numeric', month: 'short' }
        : style === 'weekday'
          ? { weekday: 'long', day: 'numeric', month: 'long' }
          : { dateStyle: 'medium' };
  return new Intl.DateTimeFormat(getLocale(), { ...options, timeZone: 'UTC' }).format(value);
}

/**
 * @param {string} yearMonth 'YYYY-MM'
 * @returns {string} e.g. "May 2024"
 */
export function formatMonth(yearMonth) {
  const [y, m] = yearMonth.split('-').map(Number);
  return new Intl.DateTimeFormat(getLocale(), {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, 1)));
}

/**
 * Relative time such as "5 minutes ago".
 * @param {string} iso past instant
 * @param {number} nowMs
 * @returns {string}
 */
export function formatRelativeTime(iso, nowMs) {
  const seconds = Math.round((Date.parse(iso) - nowMs) / 1000);
  const formatter = new Intl.RelativeTimeFormat(getLocale(), { numeric: 'auto' });
  const abs = Math.abs(seconds);
  if (abs < 60) return formatter.format(seconds, 'second');
  if (abs < 3600) return formatter.format(Math.round(seconds / 60), 'minute');
  if (abs < 86_400) return formatter.format(Math.round(seconds / 3600), 'hour');
  return formatter.format(Math.round(seconds / 86_400), 'day');
}

/**
 * @param {number} value
 * @returns {string}
 */
export function formatPercent(value) {
  return new Intl.NumberFormat(getLocale(), { maximumFractionDigits: 0 }).format(value);
}

/**
 * Maps any thrown value to a user-readable message. Raw error text is never shown.
 * @param {unknown} error
 * @returns {string}
 */
export function errorMessage(error) {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    const key = `errors.${error.code}`;
    if (hasTranslation(key)) return t(key);
  }
  return t('errors.unknown');
}
