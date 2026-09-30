/**
 * Device head files (`devices/<id>/head.json`) and JSON parsing helpers for downloaded files.
 * See docs/SYNC_PROTOCOL.md §5.
 */

import { segmentFileName } from './operation.js';

/** @typedef {{ file: string, startSeq: number, endSeq: number }} SegmentRef */

/**
 * @typedef {object} DeviceHead
 * @property {string} deviceId
 * @property {string} deviceName
 * @property {number} lastSeq
 * @property {SegmentRef[]} segments
 * @property {string} [updatedAt]
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
  return {
    deviceId,
    deviceName: typeof head.deviceName === 'string' ? head.deviceName : '',
    lastSeq: head.lastSeq,
    segments: /** @type {SegmentRef[]} */ (head.segments),
    updatedAt: typeof head.updatedAt === 'string' ? head.updatedAt : undefined,
  };
}
