import { describe, expect, it } from 'vitest';
import {
  isoWeekday,
  nthWeekday,
  phaseFor,
  repeatDates,
  roundsUntil,
} from '../../../src/core/domain/repeatSchedule.js';

/** @typedef {import('../../../src/core/domain/repeatSchedule.js').RepeatSchedule} RepeatSchedule */

// Monday 2026-10-05.
const today = '2026-10-05';

describe('repeat schedule', () => {
  it('numbers weekdays the ISO way', () => {
    expect(isoWeekday('2026-10-05')).toBe(1);
    expect(isoWeekday('2026-10-11')).toBe(7);
  });

  it('repeats every 2 days from the round chosen as the first', () => {
    /** @type {RepeatSchedule} */
    const everyOther = { every: 2, unit: 'day', phase: phaseFor('day', 2, 0, today) };
    expect(repeatDates(everyOther, today, '2026-10-10')).toEqual([
      '2026-10-05',
      '2026-10-07',
      '2026-10-09',
    ]);
    const fromTomorrow = { ...everyOther, phase: phaseFor('day', 2, 1, today) };
    expect(repeatDates(fromTomorrow, today, '2026-10-10')).toEqual([
      '2026-10-06',
      '2026-10-08',
      '2026-10-10',
    ]);
  });

  it('repeats on chosen weekdays, every week or every other week', () => {
    /** @type {RepeatSchedule} */
    const monTue = { every: 1, unit: 'week', phase: 0, weekdays: [1, 2] };
    expect(repeatDates(monTue, today, '2026-10-18')).toEqual([
      '2026-10-05',
      '2026-10-06',
      '2026-10-12',
      '2026-10-13',
    ]);
    /** @type {RepeatSchedule} */
    const fridays = { every: 2, unit: 'week', phase: phaseFor('week', 2, 0, today), weekdays: [5] };
    expect(repeatDates(fridays, today, '2026-10-31')).toEqual(['2026-10-09', '2026-10-23']);
    const nextWeek = { ...fridays, phase: phaseFor('week', 2, 1, today) };
    expect(repeatDates(nextWeek, today, '2026-10-31')).toEqual(['2026-10-16', '2026-10-30']);
  });

  it('puts day 31 on the last day of shorter months', () => {
    /** @type {RepeatSchedule} */
    const last = { every: 1, unit: 'month', phase: 0, monthDay: { kind: 'day', day: 31 } };
    expect(repeatDates(last, '2026-02-01', '2026-04-30')).toEqual([
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);
  });

  it('finds the first and the last weekday of a month', () => {
    // October 2026 starts on a Thursday and ends on a Saturday.
    expect(nthWeekday(2026, 10, 1, 1)).toBe('2026-10-05');
    expect(nthWeekday(2026, 10, 4, 4)).toBe('2026-10-22');
    expect(nthWeekday(2026, 10, -1, 5)).toBe('2026-10-30');
    expect(nthWeekday(2026, 10, -1, 6)).toBe('2026-10-31');
    /** @type {RepeatSchedule} */
    const lastFriday = {
      every: 1,
      unit: 'month',
      phase: 0,
      monthDay: { kind: 'weekday', nth: -1, weekday: 5 },
    };
    expect(repeatDates(lastFriday, today, '2026-12-31')).toEqual([
      '2026-10-30',
      '2026-11-27',
      '2026-12-25',
    ]);
  });

  it('repeats every 3 months from the month chosen as the first', () => {
    /** @type {RepeatSchedule} */
    const quarterly = {
      every: 3,
      unit: 'month',
      phase: phaseFor('month', 3, 0, today),
      monthDay: { kind: 'day', day: 15 },
    };
    expect(repeatDates(quarterly, today, '2027-06-30')).toEqual([
      '2026-10-15',
      '2027-01-15',
      '2027-04-15',
    ]);
  });

  it('repeats yearly, with 29 February on the 28th in common years', () => {
    /** @type {RepeatSchedule} */
    const leapDay = { every: 1, unit: 'year', phase: 0, month: 2, day: 29 };
    expect(repeatDates(leapDay, '2027-01-01', '2028-12-31')).toEqual(['2027-02-28', '2028-02-29']);
    /** @type {RepeatSchedule} */
    const everyOtherYear = {
      every: 2,
      unit: 'year',
      phase: phaseFor('year', 2, 1, today),
      month: 1,
      day: 1,
    };
    expect(repeatDates(everyOtherYear, today, '2031-12-31')).toEqual([
      '2027-01-01',
      '2029-01-01',
      '2031-01-01',
    ]);
  });

  it('turns "first time" choices into phases and back, across a year boundary', () => {
    for (const unit of /** @type {const} */ (['day', 'week', 'month', 'year'])) {
      for (let roundsFromNow = 0; roundsFromNow < 3; roundsFromNow += 1) {
        const phase = phaseFor(unit, 3, roundsFromNow, '2026-12-30');
        expect(roundsUntil(unit, 3, phase, '2026-12-30')).toBe(roundsFromNow);
      }
    }
  });

  it('stops at the limit and returns nothing for an empty range', () => {
    /** @type {RepeatSchedule} */
    const daily = { every: 1, unit: 'day', phase: 0 };
    expect(repeatDates(daily, today, '9999-12-31', 2)).toEqual(['2026-10-05', '2026-10-06']);
    expect(repeatDates(daily, today, '2026-10-04')).toEqual([]);
  });
});
