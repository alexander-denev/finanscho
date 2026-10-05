/**
 * Repeating schedules in the style of a calendar's custom repeat: "every N days / weeks / months /
 * years", on chosen weekdays, a day of the month, the Nth weekday of the month, or a date of the
 * year (docs/DECISIONS.md, D54).
 *
 * "Every N" needs no starting date. Every date belongs to a round counted from a fixed point
 * (days since 1970-01-01, ISO weeks since Monday 1970-01-05, months since January 1970, calendar
 * years), and a schedule is "on" in the rounds where `round mod every = phase`. Every device
 * computes the same rounds, and nothing shifts when the schedule's owner is edited.
 */

import {
  addDays,
  daysBetween,
  daysInMonth,
  dayOfWeek,
  formatLocalDate,
  parseLocalDate,
} from './localDate.js';

/** @typedef {import('./localDate.js').LocalDate} LocalDate */

export const REPEAT_UNITS = /** @type {const} */ (['day', 'week', 'month', 'year']);
export const MAX_EVERY = 999;
/** "first" … "fourth", and -1 for "last". */
export const NTH_VALUES = /** @type {const} */ ([1, 2, 3, 4, -1]);

/** @typedef {(typeof REPEAT_UNITS)[number]} RepeatUnit */
/** @typedef {(typeof NTH_VALUES)[number]} Nth */
/**
 * @typedef {{ kind: 'day', day: number } | { kind: 'weekday', nth: Nth, weekday: number }} MonthDay
 *   `day` 1–31 (past the month's end = its last day); `weekday` ISO 1 = Monday … 7 = Sunday
 */

/**
 * @typedef {object} RepeatSchedule
 * @property {number} every 1–MAX_EVERY
 * @property {RepeatUnit} unit
 * @property {number} phase which round is "on": 0 … every − 1
 * @property {number[]} [weekdays] unit week: ISO weekdays, ascending, at least one
 * @property {MonthDay} [monthDay] unit month
 * @property {number} [month] unit year: 1–12
 * @property {number} [day] unit year: a day that exists in that month in a leap year
 */

const EPOCH_DAY = '1970-01-01';
const EPOCH_MONDAY = '1970-01-05';

/**
 * @param {number} value
 * @param {number} n
 * @returns {number} `value mod n`, never negative
 */
function mod(value, n) {
  return ((value % n) + n) % n;
}

/**
 * ISO weekday: 1 = Monday … 7 = Sunday.
 * @param {LocalDate} date
 * @returns {number}
 */
export function isoWeekday(date) {
  const day = dayOfWeek(date);
  return day === 0 ? 7 : day;
}

/**
 * The round a date belongs to.
 * @param {RepeatUnit} unit
 * @param {LocalDate} date
 * @returns {number}
 */
export function roundOf(unit, date) {
  switch (unit) {
    case 'day':
      return daysBetween(EPOCH_DAY, date);
    case 'week':
      return Math.floor(daysBetween(EPOCH_MONDAY, date) / 7);
    case 'month': {
      const { year, month } = parseLocalDate(date);
      return (year - 1970) * 12 + (month - 1);
    }
    case 'year':
    default:
      return parseLocalDate(date).year;
  }
}

/**
 * The phase that makes the round `roundsFromNow` rounds after today's the first "on" round
 * ("this week" = 0, "next week" = 1, …).
 * @param {RepeatUnit} unit
 * @param {number} every
 * @param {number} roundsFromNow 0 … every − 1
 * @param {LocalDate} today
 * @returns {number}
 */
export function phaseFor(unit, every, roundsFromNow, today) {
  return mod(roundOf(unit, today) + roundsFromNow, every);
}

/**
 * How many rounds from today's until the next "on" round (0 = today's round is on). The reverse
 * of `phaseFor`.
 * @param {RepeatUnit} unit
 * @param {number} every
 * @param {number} phase
 * @param {LocalDate} today
 * @returns {number}
 */
export function roundsUntil(unit, every, phase, today) {
  return mod(phase - roundOf(unit, today), every);
}

/**
 * The Nth (or last, -1) given weekday of a month.
 * @param {number} year
 * @param {number} month 1-12
 * @param {Nth} nth
 * @param {number} weekday ISO 1-7
 * @returns {LocalDate}
 */
export function nthWeekday(year, month, nth, weekday) {
  if (nth > 0) {
    const first = formatLocalDate({ year, month, day: 1 });
    return addDays(first, mod(weekday - isoWeekday(first), 7) + (nth - 1) * 7);
  }
  const last = formatLocalDate({ year, month, day: daysInMonth(year, month) });
  return addDays(last, -mod(isoWeekday(last) - weekday, 7));
}

/**
 * @param {number} year
 * @param {number} month 1-12
 * @param {number} day may exceed the month's length
 * @returns {LocalDate}
 */
function clampedDate(year, month, day) {
  return formatLocalDate({ year, month, day: Math.min(day, daysInMonth(year, month)) });
}

/**
 * The schedule's dates within one round, ascending.
 * @param {RepeatSchedule} schedule
 * @param {number} round
 * @returns {LocalDate[]}
 */
function datesInRound(schedule, round) {
  switch (schedule.unit) {
    case 'day':
      return [addDays(EPOCH_DAY, round)];
    case 'week': {
      const monday = addDays(EPOCH_MONDAY, round * 7);
      return (schedule.weekdays ?? []).map((weekday) => addDays(monday, weekday - 1));
    }
    case 'month': {
      const year = 1970 + Math.floor(round / 12);
      const month = mod(round, 12) + 1;
      const monthDay = schedule.monthDay;
      if (!monthDay) return [];
      return [
        monthDay.kind === 'day'
          ? clampedDate(year, month, monthDay.day)
          : nthWeekday(year, month, monthDay.nth, monthDay.weekday),
      ];
    }
    case 'year':
    default:
      return [clampedDate(round, schedule.month ?? 1, schedule.day ?? 1)];
  }
}

/**
 * The schedule's dates within `[from, to]` (inclusive), ascending, at most `limit` of them.
 * @param {RepeatSchedule} schedule
 * @param {LocalDate} from
 * @param {LocalDate} to
 * @param {number} [limit]
 * @returns {LocalDate[]}
 */
export function repeatDates(schedule, from, to, limit = Infinity) {
  /** @type {LocalDate[]} */
  const dates = [];
  if (to < from) return dates;
  const last = roundOf(schedule.unit, to);
  const start = roundOf(schedule.unit, from);
  for (
    let round = start + mod(schedule.phase - start, schedule.every);
    round <= last && dates.length < limit;
    round += schedule.every
  ) {
    for (const date of datesInRound(schedule, round)) {
      if (date < from || date > to) continue;
      dates.push(date);
      if (dates.length >= limit) break;
    }
  }
  return dates;
}
