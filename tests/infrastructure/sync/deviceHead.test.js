import { describe, expect, it } from 'vitest';
import {
  parseCheckpoint,
  parseHead,
  parseJson,
} from '../../../src/infrastructure/sync/deviceHead.js';
import { segmentFileName } from '../../../src/infrastructure/sync/operation.js';

describe('parseJson', () => {
  it('returns undefined instead of throwing', () => {
    expect(parseJson('{"a":1}')).toEqual({ a: 1 });
    expect(parseJson('nope')).toBeUndefined();
    expect(parseJson(null)).toBeUndefined();
  });
});

describe('parseHead', () => {
  it('validates head structure', () => {
    const ok = {
      deviceId: 'd',
      lastSeq: 3,
      segments: [{ file: segmentFileName(1, 3), startSeq: 1, endSeq: 3 }],
    };
    expect(parseHead(ok, 'd')).toMatchObject({ lastSeq: 3, deviceName: '' });
    expect(parseHead({ ...ok, deviceId: 'other' }, 'd')).toBeNull();
    expect(parseHead({ ...ok, lastSeq: 4 }, 'd')).toBeNull();
    expect(
      parseHead({ ...ok, segments: [{ file: 'x.json', startSeq: 1, endSeq: 3 }] }, 'd'),
    ).toBeNull();
    expect(parseHead({ deviceId: 'd', lastSeq: 0, segments: [] }, 'd')).toMatchObject({
      lastSeq: 0,
    });
    const overlapping = {
      deviceId: 'd',
      lastSeq: 4,
      segments: [
        { file: segmentFileName(1, 3), startSeq: 1, endSeq: 3 },
        { file: segmentFileName(3, 4), startSeq: 3, endSeq: 4 },
      ],
    };
    expect(parseHead(overlapping, 'd')).toBeNull();
    expect(parseHead(null, 'd')).toBeNull();
  });
});

describe('parseCheckpoint', () => {
  const seg = (/** @type {number} */ startSeq, /** @type {number} */ endSeq) => ({
    file: segmentFileName(startSeq, endSeq),
    startSeq,
    endSeq,
  });
  // A trimmed head: checkpoint 101–700 in two segments, then a tail.
  const segments = [seg(101, 600), seg(601, 700), seg(701, 720)];
  const checkpoint = {
    startSeq: 101,
    endSeq: 700,
    frontier: { other: 42 },
    createdAt: '2026-10-02T00:00:00.000Z',
  };

  it('accepts a checkpoint that is exactly a contiguous run of listed segments', () => {
    expect(parseCheckpoint(checkpoint, segments)).toEqual(checkpoint);
    const head = { deviceId: 'd', lastSeq: 720, segments, checkpoint };
    expect(parseHead(head, 'd')?.checkpoint).toEqual(checkpoint);
  });

  it('ignores an invalid checkpoint instead of rejecting the head', () => {
    for (const bad of [
      { ...checkpoint, startSeq: 102 },
      { ...checkpoint, endSeq: 650 },
      { ...checkpoint, endSeq: 900 },
      { ...checkpoint, frontier: { other: -1 } },
      { ...checkpoint, frontier: { other: 1.5 } },
      { ...checkpoint, frontier: [] },
      { ...checkpoint, createdAt: 7 },
      'checkpoint',
    ]) {
      expect(parseCheckpoint(bad, segments)).toBeUndefined();
      const head = parseHead({ deviceId: 'd', lastSeq: 720, segments, checkpoint: bad }, 'd');
      expect(head).not.toBeNull();
      expect(head?.checkpoint).toBeUndefined();
    }
    // A gap inside the checkpoint range is not contiguous.
    expect(parseCheckpoint(checkpoint, [seg(101, 600), seg(650, 700)])).toBeUndefined();
  });
});
