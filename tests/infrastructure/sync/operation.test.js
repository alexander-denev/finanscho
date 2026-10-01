import { describe, expect, it } from 'vitest';
import {
  isSupportedOp,
  parseSegment,
  parseSegmentFileName,
  segmentFileName,
  validateOp,
} from '../../../src/infrastructure/sync/operation.js';

const hlc = '000000000001000-000000-dev';

/**
 * @param {number} seq
 * @param {object} [over]
 */
const op = (seq, over = {}) => ({
  v: 1,
  deviceId: 'dev',
  seq,
  hlc,
  entity: 'transactions',
  id: `t${seq}`,
  fields: { note: 'x' },
  origin: 'user',
  ...over,
});

describe('operation', () => {
  it('names segments with zero-padded seqs and parses the names back', () => {
    expect(segmentFileName(1, 500)).toBe('000000000001-000000000500.json');
    expect(parseSegmentFileName(segmentFileName(501, 742))).toEqual({ startSeq: 501, endSeq: 742 });
    expect(parseSegmentFileName('head.json')).toBeNull();
    expect(parseSegmentFileName('000000000009-000000000002.json')).toBeNull();
    expect(parseSegmentFileName('000000000000-000000000002.json')).toBeNull();
  });

  it('validates op shape', () => {
    expect(validateOp(op(1))).toBeNull();
    expect(validateOp(null)).toBe('not an object');
    expect(validateOp(op(0))).toBe('bad seq');
    expect(validateOp(op(1, { hlc: 'x' }))).toBe('bad hlc');
    expect(validateOp(op(1, { fields: [] }))).toBe('bad fields');
    expect(validateOp(op(1, { fields: { _clocks: {} } }))).toBe('reserved field');
    expect(validateOp(op(1, { id: '' }))).toBe('bad id');
  });

  it('distinguishes supported ops', () => {
    expect(isSupportedOp(/** @type {any} */ (op(1)))).toBe(true);
    expect(isSupportedOp(/** @type {any} */ (op(1, { v: 2 })))).toBe(false);
    expect(isSupportedOp(/** @type {any} */ (op(1, { entity: 'goals' })))).toBe(false);
  });

  it('parses a well-formed segment', () => {
    const result = parseSegment([op(3), op(4)], { deviceId: 'dev', startSeq: 3, endSeq: 4 });
    expect(result.ok).toBe(true);
  });

  it.each([
    [{ not: 'array' }, 'segment is not an array'],
    [[op(3)], 'segment length does not match its range'],
    [[op(3), op(5)], 'op 1: seq out of order'],
    [[op(3), op(4, { deviceId: 'other' })], 'op 1: wrong device'],
    [[op(3), { junk: true }], 'op 1: bad v'],
  ])('rejects malformed segment %#', (value, reason) => {
    const result = parseSegment(value, { deviceId: 'dev', startSeq: 3, endSeq: 4 });
    expect(result).toEqual({ ok: false, reason });
  });
});
