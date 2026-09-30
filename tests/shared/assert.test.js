import { describe, expect, it } from 'vitest';
import { assert } from '../../src/shared/assert.js';

describe('assert', () => {
  it('passes for truthy conditions', () => {
    expect(() => assert(true, 'ok')).not.toThrow();
  });

  it('throws with the message for falsy conditions', () => {
    expect(() => assert(false, 'broken')).toThrow('Assertion failed: broken');
  });
});
