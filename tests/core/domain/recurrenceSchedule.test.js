import { describe, expect, it } from 'vitest';
import {
  occurrenceDate,
  occurrencesBetween,
  occurrencesUntil,
} from '../../../src/core/domain/recurrenceSchedule.js';

/** @typedef {import('../../../src/core/domain/recurrenceSchedule.js').Schedule} Schedule */

/**
 * @param {Partial<Schedule>} over
 * @returns {Schedule}
 */
const schedule = (over) => ({
  frequency: 'monthly',
  interval: 1,
  startDate: '2024-01-31',
  endDate: null,
  ...over,
});

describe('recurrence schedule', () => {
  it('keeps monthly rules on the 31st without drifting', () => {
    const s = schedule({});
    expect([0, 1, 2, 3, 4].map((i) => occurrenceDate(s, i))).toEqual([
      '2024-01-31',
      '2024-02-29',
      '2024-03-31',
      '2024-04-30',
      '2024-05-31',
    ]);
    expect(occurrenceDate(s, 13)).toBe('2025-02-28');
  });

  it('handles the 30th and 29th in February', () => {
    expect(occurrenceDate(schedule({ startDate: '2023-01-30' }), 1)).toBe('2023-02-28');
    expect(occurrenceDate(schedule({ startDate: '2024-01-29' }), 1)).toBe('2024-02-29');
    expect(occurrenceDate(schedule({ startDate: '2023-01-29' }), 1)).toBe('2023-02-28');
  });

  it('handles yearly Feb 29 in leap and common years', () => {
    const s = schedule({ frequency: 'yearly', startDate: '2024-02-29' });
    expect([0, 1, 2, 3, 4].map((i) => occurrenceDate(s, i))).toEqual([
      '2024-02-29',
      '2025-02-28',
      '2026-02-28',
      '2027-02-28',
      '2028-02-29',
    ]);
  });

  it('supports weekly intervals', () => {
    const s = schedule({ frequency: 'weekly', interval: 2, startDate: '2024-12-23' });
    expect(occurrencesBetween(s, '2024-12-01', '2025-01-31')).toEqual([
      '2024-12-23',
      '2025-01-06',
      '2025-01-20',
    ]);
  });

  it('supports daily and multi-month intervals', () => {
    expect(
      occurrencesBetween(
        schedule({ frequency: 'daily', interval: 3, startDate: '2024-02-27' }),
        '2024-02-27',
        '2024-03-06',
      ),
    ).toEqual(['2024-02-27', '2024-03-01', '2024-03-04']);
    expect(
      occurrencesBetween(
        schedule({ interval: 3, startDate: '2024-11-30' }),
        '2024-01-01',
        '2025-12-31',
      ),
    ).toEqual(['2024-11-30', '2025-02-28', '2025-05-30', '2025-08-30', '2025-11-30']);
  });

  it('respects end date, window, and limit', () => {
    const s = schedule({ startDate: '2024-01-15', endDate: '2024-04-15' });
    expect(occurrencesBetween(s, '2024-02-01', '2024-12-31')).toEqual([
      '2024-02-15',
      '2024-03-15',
      '2024-04-15',
    ]);
    expect(occurrencesBetween(s, '2024-01-01', '2024-12-31', 2)).toEqual([
      '2024-01-15',
      '2024-02-15',
    ]);
    expect(occurrencesBetween(s, '2025-01-01', '2025-12-31')).toEqual([]);
    expect(occurrencesBetween(s, '2023-01-01', '2023-12-31')).toEqual([]);
  });

  it('finds occurrences far after the start efficiently and correctly', () => {
    const s = schedule({ frequency: 'daily', startDate: '2000-01-01' });
    expect(occurrencesBetween(s, '2024-02-28', '2024-03-01')).toEqual([
      '2024-02-28',
      '2024-02-29',
      '2024-03-01',
    ]);
    const y = schedule({ frequency: 'yearly', interval: 2, startDate: '2000-06-30' });
    expect(occurrencesBetween(y, '2019-01-01', '2024-12-31')).toEqual([
      '2020-06-30',
      '2022-06-30',
      '2024-06-30',
    ]);
  });

  it('iterates from the start up to a date inclusive', () => {
    const s = schedule({ frequency: 'weekly', startDate: '2024-01-01' });
    expect([...occurrencesUntil(s, '2024-01-15')]).toEqual([
      '2024-01-01',
      '2024-01-08',
      '2024-01-15',
    ]);
    expect([...occurrencesUntil(s, '2023-12-31')]).toEqual([]);
  });
});
