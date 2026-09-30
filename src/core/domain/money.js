/**
 * Money helpers. Amounts are always integers in minor units (e.g. cents) paired with an ISO 4217
 * currency code. Floating point is never used for storage or arithmetic.
 */

/** Default currency for totals in v1. */
export const DEFAULT_CURRENCY = 'EUR';

/**
 * Parse failure reasons, each mapped to an i18n key `validation.money.<reason>`.
 * @typedef {'empty' | 'invalid' | 'tooManyDecimals' | 'tooLarge' | 'negative'} MoneyParseError
 */

/**
 * @typedef {{ ok: true, minor: number } | { ok: false, error: MoneyParseError }} MoneyParseResult
 */

/**
 * Whether a string is a well-formed ISO 4217 currency code that Intl understands.
 * @param {unknown} code
 * @returns {code is string}
 */
export function isCurrencyCode(code) {
  if (typeof code !== 'string' || !/^[A-Z]{3}$/.test(code)) return false;
  try {
    new Intl.NumberFormat('en', { style: 'currency', currency: code });
    return true;
  } catch {
    return false;
  }
}

/**
 * Number of minor-unit digits for a currency (2 for EUR, 0 for JPY, 3 for KWD).
 * @param {string} currency ISO 4217 code
 * @returns {number}
 */
export function minorUnitExponent(currency) {
  return (
    new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
      .maximumFractionDigits ?? 2
  );
}

/**
 * Whether a value is a valid minor-unit amount (a safe integer).
 * @param {unknown} value
 * @returns {value is number}
 */
export function isMinorAmount(value) {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

/**
 * Splits a numeric string into integer and fraction digits, accepting `.` or `,` as the decimal
 * separator and the other (or spaces) as grouping. Returns null when the shape is invalid.
 * @param {string} text digits and separators only, no sign
 * @returns {{ integer: string, fraction: string } | null}
 */
function splitDecimal(text) {
  const compact = text.replace(/[\s\u00a0\u202f']/g, '');
  if (!/^[\d.,]+$/.test(compact)) return null;
  const lastDot = compact.lastIndexOf('.');
  const lastComma = compact.lastIndexOf(',');
  const dots = compact.split('.').length - 1;
  const commas = compact.split(',').length - 1;

  /** @type {string | null} */
  let decimalSep = null;
  if (dots > 0 && commas > 0) {
    decimalSep = lastDot > lastComma ? '.' : ',';
  } else if (dots === 1) {
    decimalSep = '.';
  } else if (commas === 1) {
    decimalSep = ',';
  }
  // Several identical separators with no other kind: treat them as grouping.

  let integerPart = compact;
  let fraction = '';
  if (decimalSep !== null) {
    const idx = compact.lastIndexOf(decimalSep);
    integerPart = compact.slice(0, idx);
    fraction = compact.slice(idx + 1);
    if (/[.,]/.test(fraction)) return null;
  }
  // With both separators present, the decimal one may appear only once (as the last separator).
  if (decimalSep !== null && integerPart.includes(decimalSep)) return null;
  const groups = integerPart.split(/[.,]/);
  if (groups.length > 1) {
    // Grouped integers must look like 1,234,567 (first group 1-3 digits, then groups of 3).
    const [first, ...rest] = groups;
    if (!/^\d{1,3}$/.test(first) || rest.some((g) => !/^\d{3}$/.test(g))) return null;
  }
  const integer = groups.join('');
  if (integer === '' && fraction === '') return null;
  if (!/^\d*$/.test(integer) || !/^\d*$/.test(fraction)) return null;
  return { integer: integer === '' ? '0' : integer, fraction };
}

/**
 * Parses user input directly into minor units without floating point.
 * Accepts `.` or `,` as decimal separator, optional grouping, and an optional leading `-` when
 * `allowNegative` is set. Rejects more decimals than the currency allows.
 * @param {string} input
 * @param {string} currency ISO 4217 code
 * @param {{ allowNegative?: boolean }} [options]
 * @returns {MoneyParseResult}
 */
export function parseMoney(input, currency, options = {}) {
  let text = String(input ?? '').trim();
  if (text === '') return { ok: false, error: 'empty' };
  let negative = false;
  if (text.startsWith('-') || text.startsWith('\u2212')) {
    negative = true;
    text = text.slice(1).trim();
  } else if (text.startsWith('+')) {
    text = text.slice(1).trim();
  }
  if (negative && !options.allowNegative) return { ok: false, error: 'negative' };
  const parts = splitDecimal(text);
  if (parts === null) return { ok: false, error: 'invalid' };
  const exponent = minorUnitExponent(currency);
  if (parts.fraction.length > exponent) return { ok: false, error: 'tooManyDecimals' };
  const digits = (parts.integer + parts.fraction.padEnd(exponent, '0')).replace(/^0+(?=\d)/, '');
  const big = BigInt(digits);
  if (big > BigInt(Number.MAX_SAFE_INTEGER)) return { ok: false, error: 'tooLarge' };
  const minor = Number(big);
  return { ok: true, minor: negative && minor !== 0 ? -minor : minor };
}

/**
 * Renders minor units as a plain decimal string (`1250` → `"12.50"` for EUR), suitable for
 * editing in an input and for exact `Intl.NumberFormat` formatting.
 * @param {number} minor
 * @param {string} currency
 * @returns {string}
 */
export function toDecimalString(minor, currency) {
  const exponent = minorUnitExponent(currency);
  const negative = minor < 0;
  const digits = String(Math.abs(minor)).padStart(exponent + 1, '0');
  const integer = digits.slice(0, digits.length - exponent);
  const fraction = digits.slice(digits.length - exponent);
  const body = exponent > 0 ? `${integer}.${fraction}` : integer;
  return negative ? `-${body}` : body;
}

/**
 * Formats minor units as localized currency text using exact decimal input.
 * @param {number} minor
 * @param {string} currency
 * @param {string} locale BCP 47 locale
 * @param {{ signDisplay?: 'auto' | 'always' | 'exceptZero' | 'never' }} [options]
 * @returns {string}
 */
export function formatMoney(minor, currency, locale, options = {}) {
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    signDisplay: options.signDisplay ?? 'auto',
  });
  return formatter.format(
    /** @type {Intl.StringNumericLiteral} */ (toDecimalString(minor, currency)),
  );
}

/**
 * Sums minor-unit amounts, guarding against unsafe integers.
 * @param {number[]} amounts
 * @returns {number}
 */
export function sumMinor(amounts) {
  let total = 0;
  for (const amount of amounts) total += amount;
  if (!Number.isSafeInteger(total)) throw new RangeError('Money total exceeds safe integer range');
  return total;
}
