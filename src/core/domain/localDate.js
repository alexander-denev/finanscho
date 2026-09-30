/**
 * Local calendar values. A `LocalDate` is a `'YYYY-MM-DD'` string and a `YearMonth` is a
 * `'YYYY-MM'` string. They are never converted to timestamps, so they do not shift across time
 * zones. Arithmetic uses UTC internally purely as a calendar calculator.
 */

/** @typedef {string} LocalDate 'YYYY-MM-DD' */
/** @typedef {string} YearMonth 'YYYY-MM' */
/** @typedef {{ year: number, month: number, day: number }} DateParts month is 1-12 */

const DAY_MS = 86_400_000;

/**
 * @param {number} year
 * @returns {boolean}
 */
export function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * @param {number} year
 * @param {number} month 1-12
 * @returns {number}
 */
export function daysInMonth(year, month) {
  const lengths = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return lengths[month - 1];
}

/**
 * @param {number} value
 * @param {number} width
 * @returns {string}
 */
function pad(value, width) {
  return String(value).padStart(width, '0');
}

/**
 * @param {DateParts} parts
 * @returns {LocalDate}
 */
export function formatLocalDate({ year, month, day }) {
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

/**
 * @param {number} year
 * @param {number} month 1-12
 * @returns {YearMonth}
 */
export function formatYearMonth(year, month) {
  return `${pad(year, 4)}-${pad(month, 2)}`;
}

/**
 * Whether a value is a valid calendar date string `'YYYY-MM-DD'`.
 * @param {unknown} value
 * @returns {value is LocalDate}
 */
export function isLocalDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

/**
 * Whether a value is a valid `'YYYY-MM'` string.
 * @param {unknown} value
 * @returns {value is YearMonth}
 */
export function isYearMonth(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}$/.test(value)) return false;
  const month = Number(value.slice(5, 7));
  return Number(value.slice(0, 4)) >= 1 && month >= 1 && month <= 12;
}

/**
 * @param {LocalDate} date
 * @returns {DateParts}
 */
export function parseLocalDate(date) {
  if (!isLocalDate(date)) throw new RangeError(`Invalid local date: ${date}`);
  return {
    year: Number(date.slice(0, 4)),
    month: Number(date.slice(5, 7)),
    day: Number(date.slice(8, 10)),
  };
}

/**
 * @param {YearMonth} yearMonth
 * @returns {{ year: number, month: number }}
 */
export function parseYearMonth(yearMonth) {
  if (!isYearMonth(yearMonth)) throw new RangeError(`Invalid year-month: ${yearMonth}`);
  return { year: Number(yearMonth.slice(0, 4)), month: Number(yearMonth.slice(5, 7)) };
}

/**
 * @param {LocalDate} date
 * @returns {number} days since 1970-01-01 (calendar arithmetic only)
 */
function toEpochDay(date) {
  const { year, month, day } = parseLocalDate(date);
  const d = new Date(0);
  d.setUTCFullYear(year, month - 1, day);
  return Math.round(d.getTime() / DAY_MS);
}

/**
 * @param {number} epochDay
 * @returns {LocalDate}
 */
function fromEpochDay(epochDay) {
  const d = new Date(epochDay * DAY_MS);
  return formatLocalDate({
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  });
}

/**
 * @param {LocalDate} date
 * @param {number} days may be negative
 * @returns {LocalDate}
 */
export function addDays(date, days) {
  return fromEpochDay(toEpochDay(date) + days);
}

/**
 * Whole days from `from` to `to` (positive when `to` is later).
 * @param {LocalDate} from
 * @param {LocalDate} to
 * @returns {number}
 */
export function daysBetween(from, to) {
  return toEpochDay(to) - toEpochDay(from);
}

/**
 * Day of week, 0 = Sunday … 6 = Saturday.
 * @param {LocalDate} date
 * @returns {number}
 */
export function dayOfWeek(date) {
  return (((toEpochDay(date) + 4) % 7) + 7) % 7;
}

/**
 * Adds months to a year-month.
 * @param {YearMonth} yearMonth
 * @param {number} months may be negative
 * @returns {YearMonth}
 */
export function addMonthsToYearMonth(yearMonth, months) {
  const { year, month } = parseYearMonth(yearMonth);
  const index = year * 12 + (month - 1) + months;
  return formatYearMonth(Math.floor(index / 12), (((index % 12) + 12) % 12) + 1);
}

/**
 * Returns the date `months` months after `date`, placing it on `anchorDay` (default: the date's own
 * day) clamped to the month's length. Jan 31 + 1 month = Feb 28/29.
 * @param {LocalDate} date
 * @param {number} months
 * @param {number} [anchorDay]
 * @returns {LocalDate}
 */
export function addMonths(date, months, anchorDay) {
  const { year, month, day } = parseLocalDate(date);
  const target = parseYearMonth(addMonthsToYearMonth(formatYearMonth(year, month), months));
  const wanted = anchorDay ?? day;
  return formatLocalDate({
    year: target.year,
    month: target.month,
    day: Math.min(wanted, daysInMonth(target.year, target.month)),
  });
}

/**
 * @param {LocalDate} date
 * @returns {YearMonth}
 */
export function yearMonthOf(date) {
  return date.slice(0, 7);
}

/**
 * @param {YearMonth} yearMonth
 * @returns {LocalDate}
 */
export function firstDayOfMonth(yearMonth) {
  return `${yearMonth}-01`;
}

/**
 * @param {YearMonth} yearMonth
 * @returns {LocalDate}
 */
export function lastDayOfMonth(yearMonth) {
  const { year, month } = parseYearMonth(yearMonth);
  return formatLocalDate({ year, month, day: daysInMonth(year, month) });
}

/**
 * Reads the local calendar date of a `Date` object using its local-time getters. Callers pass the
 * Date in; this module never reads the system clock.
 * @param {Date} date
 * @returns {LocalDate}
 */
export function localDateFromDate(date) {
  return formatLocalDate({
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
  });
}

/**
 * Compares two local dates (or year-months); works because the format is fixed-width.
 * @param {string} a
 * @param {string} b
 * @returns {number} negative, zero, or positive
 */
export function compareLocalDates(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
