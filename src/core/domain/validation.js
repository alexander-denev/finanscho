/**
 * Small shared validators used by the entity modules. Each returns an i18n error key or null.
 */

import { ValidationError } from '../errors.js';

/**
 * Fields shared by every synced entity.
 * @typedef {object} BaseEntity
 * @property {string} id
 * @property {string} createdAt ISO 8601 UTC
 * @property {string} updatedAt ISO 8601 UTC
 * @property {boolean} deleted tombstone flag; deleted records are hidden from queries
 */

/**
 * Context supplied by a service when building an entity.
 * @typedef {object} EntityContext
 * @property {string} id
 * @property {string} now ISO 8601 UTC timestamp
 */

export const MAX_NAME_LENGTH = 80;
export const MAX_TEXT_LENGTH = 500;

/**
 * @param {unknown} value
 * @param {number} [maxLength]
 * @returns {string | null} i18n error key
 */
export function checkRequiredText(value, maxLength = MAX_NAME_LENGTH) {
  if (typeof value !== 'string' || value.trim() === '') return 'validation.required';
  if (value.trim().length > maxLength) return 'validation.tooLong';
  return null;
}

/**
 * @param {unknown} value
 * @param {number} [maxLength]
 * @returns {string | null} i18n error key
 */
export function checkOptionalText(value, maxLength = MAX_TEXT_LENGTH) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return 'validation.invalid';
  if (value.trim().length > maxLength) return 'validation.tooLong';
  return null;
}

/**
 * @template {string} T
 * @param {unknown} value
 * @param {readonly T[]} allowed
 * @returns {value is T}
 */
export function isOneOf(value, allowed) {
  return typeof value === 'string' && /** @type {readonly string[]} */ (allowed).includes(value);
}

/**
 * Checks a value such as an icon or color: valid when `isValid` accepts it, or when it is what the record already
 * has. A record synced from a newer app version may carry one this version doesn't know; keeping
 * it must not block other edits.
 * @param {unknown} value
 * @param {(value: unknown) => boolean} isValid
 * @param {unknown} current the existing record's value (undefined when creating)
 * @returns {string | null} i18n error key
 */
export function checkKeptOrValid(value, isValid, current) {
  return isValid(value) || (current !== undefined && value === current)
    ? null
    : 'validation.invalid';
}

/**
 * Collects non-null errors and throws a ValidationError when any exist.
 * @param {Record<string, string | null>} checks field → error key or null
 * @returns {void}
 */
export function throwIfInvalid(checks) {
  /** @type {Record<string, string>} */
  const fields = {};
  for (const [field, error] of Object.entries(checks)) {
    if (error !== null) fields[field] = error;
  }
  if (Object.keys(fields).length > 0) throw new ValidationError(fields);
}

/**
 * Normalizes optional free text: trims, and turns empty/missing into ''.
 * @param {unknown} value
 * @returns {string}
 */
export function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}
