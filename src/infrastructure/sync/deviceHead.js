/**
 * Device head files (`devices/<id>/head.json`) and JSON parsing helpers for downloaded files.
 * See docs/SYNC_PROTOCOL.md §5.
 */

import { segmentFileName } from './operation.js';

/** @typedef {{ file: string, startSeq: number, endSeq: number }} SegmentRef */

/**
 * A checkpoint: seqs `startSeq..endSeq` hold the device's full state at `createdAt`, which
 * contains every op of each `frontier` device up to that seq (docs/SYNC_PROTOCOL.md §10).
 * @typedef {object} Checkpoint
 * @property {number} startSeq
 * @property {number} endSeq
 * @property {Record<string, number>} frontier
 * @property {string} createdAt
 */

/**
 * @typedef {object} DeviceHead
 * @property {string} deviceId
 * @property {string} deviceName
 * @property {number} lastSeq
 * @property {SegmentRef[]} segments
 * @property {string} [updatedAt]
 * @property {Checkpoint} [checkpoint] optional; absent in heads written before compaction
 */

/**
 * Parses JSON text without throwing.
 * @param {unknown} text
 * @returns {unknown} parsed JSON, or undefined when not valid JSON
 */
export function parseJson(text) {
  if (typeof text !== 'string') return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * @param {unknown} value
 * @returns {value is number}
 */
function isSeq(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/**
 * Validates a head's optional checkpoint: its range must be exactly a contiguous run of listed
 * segments, and the frontier must map device IDs to seqs. Returns undefined when absent or invalid,
 * so a bad checkpoint is ignored rather than making the head unreadable.
 * @param {unknown} value
 * @param {SegmentRef[]} segments
 * @returns {Checkpoint | undefined}
 */
export function parseCheckpoint(value, segments) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const { startSeq, endSeq, frontier, createdAt } = /** @type {Record<string, unknown>} */ (value);
  if (!isSeq(startSeq) || !isSeq(endSeq) || startSeq < 1 || endSeq < startSeq) return undefined;
  if (typeof createdAt !== 'string') return undefined;
  if (typeof frontier !== 'object' || frontier === null || Array.isArray(frontier)) {
    return undefined;
  }
  const entries = Object.entries(frontier);
  if (!entries.every(([id, seq]) => id !== '' && isSeq(seq))) return undefined;
  const first = segments.findIndex((s) => s.startSeq === startSeq);
  if (first === -1) return undefined;
  let expected = startSeq;
  for (const segment of segments.slice(first)) {
    if (segment.startSeq !== expected) return undefined;
    if (segment.endSeq === endSeq) {
      return { startSeq, endSeq, frontier: Object.fromEntries(entries), createdAt };
    }
    if (segment.endSeq > endSeq) return undefined;
    expected = segment.endSeq + 1;
  }
  return undefined;
}

/**
 * Validates a head file for a device.
 * @param {unknown} value
 * @param {string} deviceId
 * @returns {DeviceHead | null}
 */
export function parseHead(value, deviceId) {
  if (typeof value !== 'object' || value === null) return null;
  const head = /** @type {Record<string, unknown>} */ (value);
  if (head.deviceId !== deviceId) return null;
  if (typeof head.lastSeq !== 'number' || !Number.isSafeInteger(head.lastSeq) || head.lastSeq < 0) {
    return null;
  }
  if (!Array.isArray(head.segments)) return null;
  let expectedStart = 1;
  for (const seg of head.segments) {
    if (typeof seg !== 'object' || seg === null) return null;
    const { file, startSeq, endSeq } = /** @type {Record<string, unknown>} */ (seg);
    if (typeof startSeq !== 'number' || typeof endSeq !== 'number') return null;
    if (!Number.isSafeInteger(startSeq) || !Number.isSafeInteger(endSeq) || endSeq < startSeq) {
      return null;
    }
    // Segments are ascending and never overlap. Gaps are tolerated (a server restored from an
    // older backup); the pushing device then republishes its full state.
    if (startSeq < expectedStart) return null;
    if (file !== segmentFileName(startSeq, endSeq)) return null;
    expectedStart = endSeq + 1;
  }
  const lastEnd = head.segments.length > 0 ? expectedStart - 1 : 0;
  if (lastEnd !== head.lastSeq) return null;
  const segments = /** @type {SegmentRef[]} */ (head.segments);
  /** @type {DeviceHead} */
  const parsed = {
    deviceId,
    deviceName: typeof head.deviceName === 'string' ? head.deviceName : '',
    lastSeq: head.lastSeq,
    segments,
    updatedAt: typeof head.updatedAt === 'string' ? head.updatedAt : undefined,
  };
  const checkpoint = parseCheckpoint(head.checkpoint, segments);
  if (checkpoint) parsed.checkpoint = checkpoint;
  return parsed;
}
