import { describe, expect, it } from 'vitest';
import { randomUuid } from '../../src/shared/randomUuid.js';

/** @typedef {Uint8Array<ArrayBuffer>} Bytes */

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('randomUuid', () => {
  it('uses randomUUID when the browser offers it', () => {
    const source = {
      randomUUID: () => 'from-native',
      getRandomValues: (/** @type {Bytes} */ a) => a,
    };
    expect(randomUuid(source)).toBe('from-native');
  });

  it('builds a version 4 UUID from getRandomValues outside secure contexts', () => {
    const source = {
      getRandomValues: (/** @type {Bytes} */ a) => globalThis.crypto.getRandomValues(a),
    };
    const ids = new Set(Array.from({ length: 50 }, () => randomUuid(source)));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(id).toMatch(UUID_V4);
  });

  it('sets the version and variant bits even for all-ones bytes', () => {
    const source = { getRandomValues: (/** @type {Bytes} */ a) => a.fill(0xff) };
    expect(randomUuid(source)).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
  });
});
