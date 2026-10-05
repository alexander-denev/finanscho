/**
 * Operation (op) shape, validation, and segment serialization. See docs/SYNC_PROTOCOL.md §1.3.
 */

import { HybridLogicalClock } from './HybridLogicalClock.js';

/** Current op format version. */
export const OP_VERSION = 1;

/** Entity stores that are synced. */
export const SYNCED_ENTITIES = /** @type {const} */ ([
  'accounts',
  'categories',
  'transactions',
  'budgets',
  'automations',
]);

/**
 * Entities that were synced by older app versions and no longer exist. Their ops are dropped on
 * arrival instead of being kept for replay (docs/DECISIONS.md, D50): no future version will apply
 * them, and kept ops would shut the device out of the checkpoint frontier for good.
 */
export const RETIRED_ENTITIES = /** @type {const} */ (['recurringRules']);

/** @typedef {(typeof SYNCED_ENTITIES)[number]} EntityName */
/**
 * Who made an op: the user, an automation, or (in older app versions) a recurring rule or
 * recurring budget. Informational only; clients accept any string.
 * @typedef {'user' | 'automation' | 'recurrence'} OpOrigin
 */

/**
 * @typedef {object} Op
 * @property {number} v
 * @property {string} deviceId
 * @property {number} seq
 * @property {string} hlc
 * @property {EntityName} entity
 * @property {string} id
 * @property {Record<string, unknown>} fields
 * @property {OpOrigin} origin
 */

/** Maximum ops per pushed segment. */
export const SEGMENT_SIZE = 500;

/** Digits used for zero-padded seqs in segment file names. */
const SEQ_WIDTH = 12;

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @returns {value is EntityName}
 */
export function isEntityName(value) {
  return (
    typeof value === 'string' && /** @type {readonly string[]} */ (SYNCED_ENTITIES).includes(value)
  );
}

/**
 * Structural validation of an op. Returns a reason string when invalid, or null.
 * Ops with a newer `v` or an unknown entity are "valid but unsupported"; see {@link isSupportedOp}.
 * @param {unknown} value
 * @returns {string | null}
 */
export function validateOp(value) {
  if (!isPlainObject(value)) return 'not an object';
  const { v, deviceId, seq, hlc, entity, id, fields, origin } = value;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) return 'bad v';
  if (typeof deviceId !== 'string' || deviceId === '') return 'bad deviceId';
  if (typeof seq !== 'number' || !Number.isSafeInteger(seq) || seq < 1) return 'bad seq';
  if (!HybridLogicalClock.isValid(hlc)) return 'bad hlc';
  if (typeof entity !== 'string' || entity === '') return 'bad entity';
  if (typeof id !== 'string' || id === '') return 'bad id';
  if (!isPlainObject(fields)) return 'bad fields';
  if ('id' in fields || '_clocks' in fields) return 'reserved field';
  if (typeof origin !== 'string') return 'bad origin';
  return null;
}

/**
 * Whether the op belongs to an entity that no longer exists.
 * @param {Op} op
 * @returns {boolean}
 */
export function isRetiredOp(op) {
  return /** @type {readonly string[]} */ (RETIRED_ENTITIES).includes(op.entity);
}

/**
 * Whether this client understands the op well enough to apply it.
 * @param {Op} op
 * @returns {boolean}
 */
export function isSupportedOp(op) {
  return op.v <= OP_VERSION && isEntityName(op.entity);
}

/**
 * @param {number} seq
 * @returns {string}
 */
function padSeq(seq) {
  return String(seq).padStart(SEQ_WIDTH, '0');
}

/**
 * File name of a segment holding seqs `startSeq..endSeq`.
 * @param {number} startSeq
 * @param {number} endSeq
 * @returns {string}
 */
export function segmentFileName(startSeq, endSeq) {
  return `${padSeq(startSeq)}-${padSeq(endSeq)}.json`;
}

/**
 * Seq range of a segment file name, or null when the name is not a segment file.
 * @param {string} name e.g. '000000000001-000000000500.json'
 * @returns {{ startSeq: number, endSeq: number } | null}
 */
export function parseSegmentFileName(name) {
  const match = /^(\d{12})-(\d{12})\.json$/.exec(name);
  if (!match) return null;
  const startSeq = Number(match[1]);
  const endSeq = Number(match[2]);
  return startSeq >= 1 && endSeq >= startSeq ? { startSeq, endSeq } : null;
}

/**
 * Validates a downloaded segment: an array of valid ops from one device with contiguous seqs
 * matching the declared range.
 * @param {unknown} value parsed JSON
 * @param {{ deviceId: string, startSeq: number, endSeq: number }} expected
 * @returns {{ ok: true, ops: Op[] } | { ok: false, reason: string }}
 */
export function parseSegment(value, expected) {
  if (!Array.isArray(value)) return { ok: false, reason: 'segment is not an array' };
  if (value.length !== expected.endSeq - expected.startSeq + 1) {
    return { ok: false, reason: 'segment length does not match its range' };
  }
  for (let i = 0; i < value.length; i += 1) {
    const reason = validateOp(value[i]);
    if (reason !== null) return { ok: false, reason: `op ${i}: ${reason}` };
    const op = /** @type {Op} */ (value[i]);
    if (op.deviceId !== expected.deviceId) return { ok: false, reason: `op ${i}: wrong device` };
    if (op.seq !== expected.startSeq + i) return { ok: false, reason: `op ${i}: seq out of order` };
  }
  return { ok: true, ops: /** @type {Op[]} */ (value) };
}
