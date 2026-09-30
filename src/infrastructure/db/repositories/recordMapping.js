/**
 * Helpers shared by the IndexedDB repositories to convert between stored records (with sync
 * metadata) and domain entities.
 */

import { isVisible } from '../../sync/merge.js';

/** @typedef {import('../../sync/merge.js').StoredRecord} StoredRecord */

/**
 * Strips sync metadata from a stored record.
 * @template T
 * @param {StoredRecord} record
 * @returns {T}
 */
export function toEntity(record) {
  const { _clocks, ...entity } = record;
  return /** @type {T} */ (/** @type {unknown} */ (entity));
}

/**
 * Maps visible records to entities, dropping tombstones and incomplete records.
 * @template T
 * @param {unknown[]} records
 * @returns {T[]}
 */
export function visibleEntities(records) {
  return /** @type {StoredRecord[]} */ (records).filter(isVisible).map((r) => toEntity(r));
}

/**
 * Returns the entity if the stored record is visible, else null.
 * @template T
 * @param {unknown} record
 * @returns {T | null}
 */
export function visibleEntity(record) {
  const stored = /** @type {StoredRecord | undefined} */ (record);
  return isVisible(stored) ? toEntity(/** @type {StoredRecord} */ (stored)) : null;
}

/**
 * The field values of an entity or partial entity, without `id`.
 * @param {object} entity
 * @returns {Record<string, unknown>}
 */
export function fieldsOf(entity) {
  const { id, ...fields } = /** @type {Record<string, unknown>} */ (entity);
  return fields;
}

/**
 * Locale-independent name comparator for stable ordering in lists.
 * @param {{ name: string }} a
 * @param {{ name: string }} b
 * @returns {number}
 */
export function byName(a, b) {
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}
