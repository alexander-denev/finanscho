import { describe, expect, it } from 'vitest';
import { parseHead, parseJson } from '../../../src/infrastructure/sync/deviceHead.js';
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
