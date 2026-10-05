/**
 * Pure occurrence-date computation for recurring rules.
 *
 * Occurrence k is computed directly from the start date (never by stepping from the previous
 * occurrence), so monthly rules anchored on the 31st land on Jan 31, Feb 28/29, Mar 31, … instead
 * of drifting to the 28th. Yearly rules anchored on Feb 29 land on Feb 28 in common years.
 */

import { addDays, addMonths, daysBetween, parseLocalDate } from './localDate.js';

/** @typedef {import('./localDate.js').LocalDate} LocalDate */

export const FREQUENCIES = /** @type {const} */ (['daily', 'weekly', 'monthly', 'yearly']);

/** @typedef {(typeof FREQUENCIES)[number]} Frequency */

/**
 * @typedef {object} Schedule
 * @property {Frequency} frequency
 * @property {number} interval every N days/weeks/months/years, N ≥ 1
 * @property {LocalDate} startDate the first occurrence
 * @property {LocalDate | null} endDate last possible occurrence date (inclusive), or none
 * @property {number} [anchorDay] monthly/yearly day of the month, clamped to the month's length;
 *   defaults to the start date's day. 31 means "the last day of the month".
 */

/**
 * The date of occurrence number `index` (0 = the start date).
 * @param {Schedule} schedule
 * @param {number} index
 * @returns {LocalDate}
 */
export function occurrenceDate(schedule, index) {
  const { frequency, interval, startDate } = schedule;
  const anchorDay = schedule.anchorDay ?? parseLocalDate(startDate).day;
  switch (frequency) {
    case 'daily':
      return addDays(startDate, index * interval);
    case 'weekly':
      return addDays(startDate, index * interval * 7);
    case 'monthly':
      return addMonths(startDate, index * interval, anchorDay);
    case 'yearly':
      return addMonths(startDate, index * interval * 12, anchorDay);
    default:
      throw new RangeError(`Unknown frequency: ${String(frequency)}`);
  }
}

/**
 * A lower bound on the index of the first occurrence on or after `from`.
 * @param {Schedule} schedule
 * @param {LocalDate} from
 * @returns {number}
 */
function firstIndexNear(schedule, from) {
  const days = daysBetween(schedule.startDate, from);
  if (days <= 0) return 0;
  const { interval } = schedule;
  switch (schedule.frequency) {
    case 'daily':
      return Math.floor(days / interval);
    case 'weekly':
      return Math.floor(days / (7 * interval));
    case 'monthly': {
      const start = parseLocalDate(schedule.startDate);
      const target = parseLocalDate(from);
      const months = (target.year - start.year) * 12 + (target.month - start.month);
      return Math.max(0, Math.floor(months / interval) - 1);
    }
    case 'yearly': {
      const years = parseLocalDate(from).year - parseLocalDate(schedule.startDate).year;
      return Math.max(0, Math.floor(years / interval) - 1);
    }
    default:
      return 0;
  }
}

/**
 * Occurrence dates within `[from, to]` (inclusive), also bounded by the schedule's start and end,
 * in ascending order, at most `limit` of them.
 * @param {Schedule} schedule
 * @param {LocalDate} from
 * @param {LocalDate} to
 * @param {number} [limit]
 * @returns {LocalDate[]}
 */
export function occurrencesBetween(schedule, from, to, limit = Infinity) {
  const upper = schedule.endDate !== null && schedule.endDate < to ? schedule.endDate : to;
  /** @type {LocalDate[]} */
  const dates = [];
  if (upper < schedule.startDate || upper < from) return dates;
  for (let index = firstIndexNear(schedule, from); dates.length < limit; index += 1) {
    const date = occurrenceDate(schedule, index);
    if (date > upper) break;
    if (date >= from) dates.push(date);
  }
  return dates;
}

/**
 * Iterates all occurrence dates from the start up to and including `until`, ascending.
 * @param {Schedule} schedule
 * @param {LocalDate} until
 * @yields {LocalDate}
 * @returns {Generator<LocalDate>}
 */
export function* occurrencesUntil(schedule, until) {
  const upper = schedule.endDate !== null && schedule.endDate < until ? schedule.endDate : until;
  for (let index = 0; ; index += 1) {
    const date = occurrenceDate(schedule, index);
    if (date > upper) return;
    yield date;
  }
}
