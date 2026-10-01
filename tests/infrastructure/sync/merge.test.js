import { describe, expect, it } from 'vitest';
import {
  applyOp,
  applyOps,
  canonicalJson,
  isPrunableTombstone,
  isVisible,
  mergeRecords,
  recordToOps,
  tombstoneStub,
} from '../../../src/infrastructure/sync/merge.js';
import { HybridLogicalClock } from '../../../src/infrastructure/sync/HybridLogicalClock.js';
import { createRandom } from '../../helpers/random.js';

/** @typedef {import('../../../src/infrastructure/sync/merge.js').MergeableOp} MergeableOp */

const DEVICES = ['aaaa', 'bbbb', 'cccc'];
const FIELDS = ['amountMinor', 'note', 'payee', 'deleted', 'tags'];

/**
 * Generates random ops for a few records from several devices, including clock ties and
 * conflicting values at identical clocks.
 * @param {number} seed
 * @param {number} count
 * @returns {MergeableOp[]}
 */
function randomOps(seed, count) {
  const rnd = createRandom(seed);
  /** @type {MergeableOp[]} */
  const ops = [];
  for (let i = 0; i < count; i += 1) {
    const hlc = HybridLogicalClock.format({
      wallMs: rnd.int(5),
      counter: rnd.int(3),
      deviceId: rnd.pick(DEVICES),
    });
    /** @type {Record<string, unknown>} */
    const fields = {};
    for (const field of FIELDS) {
      if (rnd.next() < 0.4) {
        fields[field] =
          field === 'deleted'
            ? rnd.next() < 0.5
            : field === 'tags'
              ? { list: [rnd.int(3)], nested: { x: rnd.int(2) } }
              : field === 'amountMinor'
                ? rnd.int(1000)
                : `v${rnd.int(4)}`;
      }
    }
    ops.push({ id: rnd.pick(['r1', 'r2']), hlc, fields });
  }
  return ops;
}

/**
 * Applies ops to a map of records keyed by id.
 * @param {MergeableOp[]} ops
 * @returns {Record<string, unknown>}
 */
function replay(ops) {
  /** @type {Record<string, import('../../../src/infrastructure/sync/merge.js').StoredRecord>} */
  const state = {};
  for (const op of ops) state[op.id] = applyOp(state[op.id], op).record;
  return JSON.parse(canonicalJson(state));
}

describe('merge', () => {
  it('applies newer fields and ignores older ones', () => {
    const r1 = applyOp(undefined, { id: 'x', hlc: '2', fields: { a: 1, b: 1 } });
    expect(r1.changed).toBe(true);
    const r2 = applyOp(r1.record, { id: 'x', hlc: '1', fields: { a: 9 } });
    expect(r2.changed).toBe(false);
    expect(r2.record.a).toBe(1);
    const r3 = applyOp(r2.record, { id: 'x', hlc: '3', fields: { a: 5, extra: 'kept' } });
    expect(r3.record).toMatchObject({ id: 'x', a: 5, b: 1, extra: 'kept' });
    expect(r3.record._clocks).toEqual({ a: '3', b: '2', extra: '3' });
  });

  it('does not mutate its inputs or share nested values', () => {
    const fields = { tags: { list: [1] } };
    const { record } = applyOp(undefined, { id: 'x', hlc: '1', fields });
    fields.tags.list.push(2);
    expect(record.tags).toEqual({ list: [1] });
    const before = JSON.stringify(record);
    applyOp(record, { id: 'x', hlc: '2', fields: { tags: null } });
    expect(JSON.stringify(record)).toBe(before);
  });

  it('breaks equal-clock ties by canonical value', () => {
    const a = applyOps(undefined, [
      { id: 'x', hlc: '1', fields: { v: 'apple' } },
      { id: 'x', hlc: '1', fields: { v: 'pear' } },
    ]);
    const b = applyOps(undefined, [
      { id: 'x', hlc: '1', fields: { v: 'pear' } },
      { id: 'x', hlc: '1', fields: { v: 'apple' } },
    ]);
    expect(a?.v).toBe('pear');
    expect(b?.v).toBe('pear');
  });

  it('is commutative: any permutation converges (property)', () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const ops = randomOps(seed, 25);
      const expected = replay(ops);
      const rnd = createRandom(seed * 7919);
      for (let k = 0; k < 5; k += 1) expect(replay(rnd.shuffle(ops))).toEqual(expected);
    }
  });

  it('is idempotent: duplicated delivery changes nothing (property)', () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const ops = randomOps(seed, 20);
      const rnd = createRandom(seed * 104729);
      const duplicated = rnd.shuffle([...ops, ...ops.filter(() => rnd.next() < 0.6), ...ops]);
      expect(replay(duplicated)).toEqual(replay(ops));
    }
  });

  it('is associative: merging partial replicas in any grouping converges (property)', () => {
    for (let seed = 1; seed <= 150; seed += 1) {
      const ops = randomOps(seed, 30).map((op) => ({ ...op, id: 'r' }));
      const rnd = createRandom(seed * 31);
      const parts = [[], [], []].map(() => /** @type {MergeableOp[]} */ ([]));
      for (const op of ops) parts[rnd.int(3)].push(op);
      const [a, b, c] = parts.map((p) => applyOps({ id: 'r', _clocks: {} }, p));
      if (!a || !b || !c) throw new Error('unreachable');
      const left = mergeRecords(mergeRecords(a, b), c);
      const right = mergeRecords(a, mergeRecords(b, c));
      const all = applyOps({ id: 'r', _clocks: {} }, ops);
      expect(canonicalJson(left)).toBe(canonicalJson(right));
      expect(canonicalJson(left)).toBe(canonicalJson(all));
    }
  });

  it('replays a record exactly through recordToOps', () => {
    const record = applyOps(
      undefined,
      randomOps(42, 30).map((op) => ({ ...op, id: 'r' })),
    );
    if (!record) throw new Error('unreachable');
    const rebuilt = applyOps(undefined, recordToOps(record));
    expect(canonicalJson(rebuilt)).toBe(canonicalJson(record));
  });

  it('hides tombstones and incomplete records', () => {
    expect(isVisible(undefined)).toBe(false);
    expect(isVisible({ id: 'x', _clocks: {} })).toBe(false);
    expect(isVisible({ id: 'x', _clocks: {}, createdAt: 't' })).toBe(true);
    expect(isVisible({ id: 'x', _clocks: {}, createdAt: 't', deleted: true })).toBe(false);
  });

  it('reduces tombstones to stubs, keeping fields written after the delete', () => {
    const at = (/** @type {number} */ wallMs) =>
      HybridLogicalClock.format({ wallMs, counter: 0, deviceId: 'd' });
    const record = {
      id: 't',
      amountMinor: 100,
      note: 'late edit',
      date: '2024-05-01',
      deleted: true,
      updatedAt: 'u',
      _clocks: {
        amountMinor: at(1),
        date: at(1),
        note: at(9),
        deleted: at(5),
        updatedAt: at(9),
      },
    };
    expect(tombstoneStub(record)).toEqual({
      id: 't',
      note: 'late edit',
      deleted: true,
      updatedAt: 'u',
      _clocks: { note: at(9), deleted: at(5), updatedAt: at(9) },
    });
    const live = { ...record, deleted: false };
    expect(tombstoneStub(live)).toBe(live);

    const day = 86_400_000;
    expect(isPrunableTombstone(record, 31 * day, 30 * day)).toBe(true);
    expect(isPrunableTombstone(record, 29 * day, 30 * day)).toBe(false);
    expect(isPrunableTombstone(tombstoneStub(record), 31 * day, 30 * day)).toBe(false);
    expect(isPrunableTombstone(live, 31 * day, 30 * day)).toBe(false);
  });

  it('stub merging is still a join: stubs and full tombstones converge (property)', () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const ops = randomOps(seed, 30);
      const full = applyOps(undefined, ops);
      if (!full) continue;
      // Any replica that stubbed the record and then received every op again agrees with the
      // stub of the full replica.
      const replayed = applyOps(tombstoneStub(full), ops);
      expect(canonicalJson(tombstoneStub(/** @type {any} */ (replayed)))).toBe(
        canonicalJson(tombstoneStub(full)),
      );
    }
  });

  it('serializes canonically with sorted keys', () => {
    expect(canonicalJson({ b: 1, a: [{ d: 2, c: 1 }] })).toBe('{"a":[{"c":1,"d":2}],"b":1}');
    expect(canonicalJson(undefined)).toBe('null');
  });
});
