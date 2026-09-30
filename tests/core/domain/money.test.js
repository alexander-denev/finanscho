import { describe, expect, it } from 'vitest';
import {
  formatMoney,
  isCurrencyCode,
  isMinorAmount,
  minorUnitExponent,
  parseMoney,
  sumMinor,
  toDecimalString,
} from '../../../src/core/domain/money.js';

/**
 * @param {ReturnType<typeof parseMoney>} r
 * @returns {number | string}
 */
const minor = (r) => (r.ok ? r.minor : r.error);

describe('minorUnitExponent', () => {
  it('reads the exponent from Intl', () => {
    expect(minorUnitExponent('EUR')).toBe(2);
    expect(minorUnitExponent('JPY')).toBe(0);
    expect(minorUnitExponent('KWD')).toBe(3);
  });
});

describe('isCurrencyCode', () => {
  it('accepts ISO codes and rejects junk', () => {
    expect(isCurrencyCode('EUR')).toBe(true);
    expect(isCurrencyCode('eur')).toBe(false);
    expect(isCurrencyCode('EU')).toBe(false);
    expect(isCurrencyCode(42)).toBe(false);
  });
});

describe('parseMoney', () => {
  it.each([
    ['12', 1200],
    ['12.5', 1250],
    ['12,5', 1250],
    ['12.50', 1250],
    ['0.01', 1],
    ['.5', 50],
    ['5.', 500],
    ['0', 0],
    ['007.10', 710],
    ['1,234.56', 123456],
    ['1.234,56', 123456],
    ['1 234,56', 123456],
    ['1\u00a0234,56', 123456],
    ['1,234,567', 123456700],
    ['1.234.567', 123456700],
    ['  42  ', 4200],
    ['+3', 300],
  ])('parses %j as %i cents in EUR', (input, expected) => {
    expect(minor(parseMoney(input, 'EUR'))).toBe(expected);
  });

  it.each([
    ['', 'empty'],
    ['   ', 'empty'],
    ['abc', 'invalid'],
    ['1e5', 'invalid'],
    ['12.3.4', 'invalid'],
    ['1,23,456', 'invalid'],
    ['1.234,567.89', 'invalid'],
    [',', 'invalid'],
    ['1.234', 'tooManyDecimals'],
    ['0.001', 'tooManyDecimals'],
    ['-5', 'negative'],
    ['99999999999999999', 'tooLarge'],
  ])('rejects %j with %s', (input, error) => {
    expect(minor(parseMoney(input, 'EUR'))).toBe(error);
  });

  it('never uses floating point (0.29 and 1.15 stay exact)', () => {
    expect(minor(parseMoney('0.29', 'EUR'))).toBe(29);
    expect(minor(parseMoney('1.15', 'EUR'))).toBe(115);
    expect(minor(parseMoney('4.35', 'EUR'))).toBe(435);
    expect(minor(parseMoney('1234567.89', 'EUR'))).toBe(123456789);
  });

  it('respects currency exponents', () => {
    expect(minor(parseMoney('1500', 'JPY'))).toBe(1500);
    expect(minor(parseMoney('15.5', 'JPY'))).toBe('tooManyDecimals');
    expect(minor(parseMoney('1.234', 'KWD'))).toBe(1234);
  });

  it('allows negatives only when asked', () => {
    expect(minor(parseMoney('-12,50', 'EUR', { allowNegative: true }))).toBe(-1250);
    expect(minor(parseMoney('\u221212', 'EUR', { allowNegative: true }))).toBe(-1200);
    expect(Object.is(minor(parseMoney('-0', 'EUR', { allowNegative: true })), 0)).toBe(true);
  });
});

describe('toDecimalString / formatMoney', () => {
  it('renders exact decimal strings', () => {
    expect(toDecimalString(1250, 'EUR')).toBe('12.50');
    expect(toDecimalString(5, 'EUR')).toBe('0.05');
    expect(toDecimalString(-5, 'EUR')).toBe('-0.05');
    expect(toDecimalString(1500, 'JPY')).toBe('1500');
    expect(toDecimalString(Number.MAX_SAFE_INTEGER, 'EUR')).toBe('90071992547409.91');
  });

  it('formats with Intl', () => {
    expect(formatMoney(123456, 'EUR', 'en-US')).toBe('€1,234.56');
    expect(formatMoney(-500, 'EUR', 'en-US')).toBe('-€5.00');
    expect(formatMoney(500, 'EUR', 'en-US', { signDisplay: 'always' })).toBe('+€5.00');
    expect(formatMoney(Number.MAX_SAFE_INTEGER, 'EUR', 'en-US')).toBe('€90,071,992,547,409.91');
  });
});

describe('sumMinor / isMinorAmount', () => {
  it('sums integers and guards the range', () => {
    expect(sumMinor([1, 2, 3])).toBe(6);
    expect(() => sumMinor([Number.MAX_SAFE_INTEGER, 1])).toThrow(RangeError);
    expect(isMinorAmount(10)).toBe(true);
    expect(isMinorAmount(1.5)).toBe(false);
  });
});
