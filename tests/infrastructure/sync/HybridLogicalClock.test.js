import { describe, expect, it } from 'vitest';
import {
  HybridLogicalClock,
  SEED_HLC,
} from '../../../src/infrastructure/sync/HybridLogicalClock.js';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('HybridLogicalClock', () => {
  it('formats fixed-width strings that round-trip through parse', () => {
    const s = HybridLogicalClock.format({ wallMs: 1_700_000_000_000, counter: 7, deviceId: A });
    expect(s).toBe(`001700000000000-000007-${A}`);
    expect(HybridLogicalClock.parse(s)).toEqual({
      wallMs: 1_700_000_000_000,
      counter: 7,
      deviceId: A,
    });
    expect(HybridLogicalClock.parse('nope')).toBeNull();
    expect(HybridLogicalClock.isValid(SEED_HLC)).toBe(true);
  });

  it('is strictly monotonic even when physical time stands still or goes backwards', () => {
    const clock = new HybridLogicalClock(A);
    const times = [1000, 1000, 1000, 999, 500, 1001, 1001, 2000, 10];
    const stamps = times.map((t) => clock.tick(t));
    for (let i = 1; i < stamps.length; i += 1) expect(stamps[i] > stamps[i - 1]).toBe(true);
  });

  it('moves past remote clocks that are ahead (clock skew)', () => {
    const local = new HybridLogicalClock(A);
    const aheadRemote = HybridLogicalClock.format({ wallMs: 50_000, counter: 3, deviceId: B });
    local.receive(aheadRemote, 1_000);
    const next = local.tick(1_001);
    expect(next > aheadRemote).toBe(true);
    expect(HybridLogicalClock.parse(next)?.wallMs).toBe(50_000);
  });

  it('keeps its own wall when the remote is behind', () => {
    const local = new HybridLogicalClock(A, { wallMs: 5_000, counter: 2 });
    local.receive(HybridLogicalClock.format({ wallMs: 10, counter: 9, deviceId: B }), 4_000);
    expect(local.state).toEqual({ wallMs: 5_000, counter: 3 });
  });

  it('takes the max counter when walls are equal', () => {
    const local = new HybridLogicalClock(A, { wallMs: 5_000, counter: 2 });
    local.receive(HybridLogicalClock.format({ wallMs: 5_000, counter: 8, deviceId: B }), 100);
    expect(local.state).toEqual({ wallMs: 5_000, counter: 9 });
  });

  it('resets the counter when physical time is ahead of everything', () => {
    const local = new HybridLogicalClock(A, { wallMs: 5_000, counter: 2 });
    local.receive(HybridLogicalClock.format({ wallMs: 6_000, counter: 8, deviceId: B }), 9_000);
    expect(local.state).toEqual({ wallMs: 9_000, counter: 0 });
  });

  it('ignores malformed remote clocks', () => {
    const local = new HybridLogicalClock(A, { wallMs: 5, counter: 1 });
    local.receive('garbage', 1);
    expect(local.state).toEqual({ wallMs: 5, counter: 1 });
  });

  it('rolls the counter over into the wall to stay fixed-width', () => {
    const local = new HybridLogicalClock(A, { wallMs: 5_000, counter: 999_999 });
    const next = local.tick(1);
    expect(HybridLogicalClock.parse(next)).toEqual({ wallMs: 5_001, counter: 0, deviceId: A });
  });

  it('orders by wall, then counter, then device id', () => {
    const f = (/** @type {number} */ w, /** @type {number} */ c, /** @type {string} */ d) =>
      HybridLogicalClock.format({ wallMs: w, counter: c, deviceId: d });
    const sorted = [f(2, 0, A), f(1, 5, B), f(1, 5, A), f(1, 10, A), f(10, 0, A)].sort();
    expect(sorted).toEqual([f(1, 5, A), f(1, 5, B), f(1, 10, A), f(2, 0, A), f(10, 0, A)]);
    expect(SEED_HLC < f(0, 0, A)).toBe(true);
  });
});
