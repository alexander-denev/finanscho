/**
 * Clock port. Core code never reads the system clock directly.
 * @typedef {object} Clock
 * @property {() => number} nowMs current time in epoch milliseconds
 * @property {() => string} nowIso current time as ISO 8601 UTC
 * @property {() => import('../domain/localDate.js').LocalDate} today the device's local calendar date
 */

export {};
