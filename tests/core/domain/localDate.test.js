import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  addMonthsToYearMonth,
  compareLocalDates,
  dayOfWeek,
  daysBetween,
  daysInMonth,
  firstDayOfMonth,
  isLeapYear,
  isLocalDate,
  isYearMonth,
  lastDayOfMonth,
  localDateFromDate,
  yearMonthOf,
} from '../../../src/core/domain/localDate.js';

describe('localDate', () => {
  it('knows leap years', () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2023)).toBe(false);
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2025, 2)).toBe(28);
  });

  it('validates date strings', () => {
    expect(isLocalDate('2024-02-29')).toBe(true);
    expect(isLocalDate('2023-02-29')).toBe(false);
    expect(isLocalDate('2024-13-01')).toBe(false);
    expect(isLocalDate('2024-1-01')).toBe(false);
    expect(isLocalDate(20240101)).toBe(false);
    expect(isYearMonth('2024-12')).toBe(true);
    expect(isYearMonth('2024-00')).toBe(false);
  });

  it('adds days across months, years and DST boundaries', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2024-12-31', 1)).toBe('2025-01-01');
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
    expect(addDays('2024-03-30', 2)).toBe('2024-04-01');
    expect(addDays('2024-10-26', 2)).toBe('2024-10-28');
    expect(daysBetween('2024-01-01', '2025-01-01')).toBe(366);
  });

  it('adds months with day clamping', () => {
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonths('2023-01-31', 1)).toBe('2023-02-28');
    expect(addMonths('2024-01-31', 2)).toBe('2024-03-31');
    expect(addMonths('2024-02-29', 12)).toBe('2025-02-28');
    expect(addMonths('2024-11-15', 3)).toBe('2025-02-15');
    expect(addMonths('2024-03-31', -1)).toBe('2024-02-29');
    expect(addMonthsToYearMonth('2024-01', -1)).toBe('2023-12');
    expect(addMonthsToYearMonth('2024-12', 1)).toBe('2025-01');
    expect(addMonthsToYearMonth('2024-06', -30)).toBe('2021-12');
  });

  it('computes days of week and month bounds', () => {
    expect(dayOfWeek('2024-01-01')).toBe(1);
    expect(dayOfWeek('1970-01-01')).toBe(4);
    expect(dayOfWeek('1969-12-28')).toBe(0);
    expect(yearMonthOf('2024-05-17')).toBe('2024-05');
    expect(firstDayOfMonth('2024-02')).toBe('2024-02-01');
    expect(lastDayOfMonth('2024-02')).toBe('2024-02-29');
  });

  it('reads the local date of a Date object', () => {
    expect(localDateFromDate(new Date(2024, 0, 5, 23, 59))).toBe('2024-01-05');
  });

  it('compares by string order', () => {
    expect(compareLocalDates('2024-01-01', '2024-01-02')).toBeLessThan(0);
    expect(compareLocalDates('2024-01-02', '2024-01-02')).toBe(0);
  });
});
