import { describe, expect, it, vi } from 'vitest';
import { META_KEYS } from '../../../src/infrastructure/db/ChangeRecorder.js';
import { STORES } from '../../../src/infrastructure/db/database.js';
import { HybridLogicalClock } from '../../../src/infrastructure/sync/HybridLogicalClock.js';
import { createTestDb } from '../../helpers/testDb.js';

describe('ChangeRecorder', () => {
  it('writes the record, appends the op, and advances seq and HLC atomically', async () => {
    const { db, recorder, deviceId } = await createTestDb();
    const [op] = await recorder.write({
      entity: 'accounts',
      id: 'a1',
      fields: { name: 'Wallet', createdAt: 't' },
    });
    expect(op).toMatchObject({
      v: 1,
      deviceId,
      seq: 1,
      entity: 'accounts',
      id: 'a1',
      origin: 'user',
    });
    const record = await db.get(STORES.accounts, 'a1');
    expect(record).toEqual({
      id: 'a1',
      name: 'Wallet',
      createdAt: 't',
      _clocks: { name: op.hlc, createdAt: op.hlc },
    });
    expect(await db.getAll(STORES.outbox)).toEqual([op]);
    expect(await db.get(STORES.meta, META_KEYS.localSeq)).toBe(1);
    const state = await db.get(STORES.meta, META_KEYS.hlc);
    expect(HybridLogicalClock.format({ ...state, deviceId })).toBe(op.hlc);
  });

  it('issues strictly increasing seqs and clocks', async () => {
    const { recorder } = await createTestDb();
    const ops = await recorder.write([
      { entity: 'accounts', id: 'a', fields: { name: 'A' } },
      { entity: 'accounts', id: 'a', fields: { name: 'B' } },
    ]);
    const more = await recorder.write({ entity: 'budgets', id: 'b', fields: { limitMinor: 1 } });
    const all = [...ops, ...more];
    expect(all.map((o) => o.seq)).toEqual([1, 2, 3]);
    expect(all[1].hlc > all[0].hlc && all[2].hlc > all[1].hlc).toBe(true);
  });

  it('rolls everything back when the transaction fails', async () => {
    const { db, recorder } = await createTestDb();
    await expect(
      recorder.transact(['accounts'], async (ctx) => {
        await ctx.write({ entity: 'accounts', id: 'a1', fields: { name: 'X' } });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await db.get(STORES.accounts, 'a1')).toBeUndefined();
    expect(await db.getAll(STORES.outbox)).toEqual([]);
    expect(await db.get(STORES.meta, META_KEYS.localSeq)).toBeUndefined();
  });

  it('publishes affected entities after commit', async () => {
    const { recorder, feed, db } = await createTestDb();
    const seen = vi.fn(async () => {
      // The data must already be committed when listeners run.
      expect(await db.get(STORES.accounts, 'a1')).toBeTruthy();
    });
    feed.subscribe(seen);
    await recorder.write({ entity: 'accounts', id: 'a1', fields: { name: 'A' } });
    expect(seen).toHaveBeenCalledWith({ entities: ['accounts'], source: 'local' });
  });

  it('uses an explicit clock when given and lets newer clocks win', async () => {
    const { db, recorder } = await createTestDb();
    const old = HybridLogicalClock.format({ wallMs: 1, counter: 0, deviceId: 'x' });
    const [op] = await recorder.write({
      entity: 'categories',
      id: 'c',
      fields: { name: 'Old' },
      hlc: old,
    });
    expect(op.hlc).toBe(old);
    await recorder.write({ entity: 'categories', id: 'c', fields: { name: 'New' } });
    await recorder.write({ entity: 'categories', id: 'c', fields: { name: 'Stale' }, hlc: old });
    expect((await db.get(STORES.categories, 'c')).name).toBe('New');
  });

  it('applies remote ops, advances the cursor, and skips already-applied seqs', async () => {
    const { db, recorder } = await createTestDb();
    const remoteHlc = HybridLogicalClock.format({
      wallMs: 9_999_999_999_999,
      counter: 0,
      deviceId: 'r',
    });
    const ops = [1, 2].map((seq) => ({
      v: 1,
      deviceId: 'r',
      seq,
      hlc: remoteHlc,
      entity: /** @type {const} */ ('transactions'),
      id: `t${seq}`,
      fields: { note: `n${seq}`, createdAt: 'c' },
      origin: /** @type {const} */ ('user'),
    }));
    const first = await recorder.applyRemote(ops, { deviceId: 'r', lastSeq: 2 });
    expect(first.changed).toEqual(['transactions']);
    expect(await db.get(STORES.syncCursors, 'r')).toEqual({ deviceId: 'r', lastSeq: 2 });
    const again = await recorder.applyRemote(ops, { deviceId: 'r', lastSeq: 2 });
    expect(again.changed).toEqual([]);
    // The local clock moved past the remote one, so the next local write wins.
    const [local] = await recorder.write({
      entity: 'transactions',
      id: 't1',
      fields: { note: 'mine' },
    });
    expect(local.hlc > remoteHlc).toBe(true);
    expect((await db.get(STORES.transactions, 't1')).note).toBe('mine');
  });

  it('defers unsupported ops instead of dropping them', async () => {
    const { db, recorder } = await createTestDb();
    const hlc = HybridLogicalClock.format({ wallMs: 5, counter: 0, deviceId: 'r' });
    const future = {
      v: 2,
      deviceId: 'r',
      seq: 1,
      hlc,
      entity: 'goals',
      id: 'g',
      fields: {},
      origin: 'user',
    };
    const result = await recorder.applyRemote(/** @type {any} */ ([future]), {
      deviceId: 'r',
      lastSeq: 1,
    });
    expect(result.deferred).toBe(1);
    expect(await db.get(STORES.meta, META_KEYS.deferredOps)).toEqual([future]);
    expect(await recorder.replayDeferred()).toEqual([]);
  });

  it('queues a checkpoint of the full state, keeping cursors and recording the frontier', async () => {
    const { db, recorder } = await createTestDb();
    await recorder.write({ entity: 'accounts', id: 'a', fields: { name: 'A', createdAt: 'c' } });
    await recorder.write({ entity: 'accounts', id: 'a', fields: { name: 'B' } });
    await recorder.write({
      entity: 'transactions',
      id: 't',
      fields: { note: 'x', createdAt: 'c' },
    });
    await recorder.write({ entity: 'transactions', id: 't', fields: { deleted: true } });
    // Not with ops still waiting to be published.
    expect(await recorder.queueCheckpoint({ createdAt: 'now' })).toBeNull();
    await db.clear(STORES.outbox);
    await db.put(STORES.syncCursors, { deviceId: 'r1', lastSeq: 40 });
    await db.put(STORES.syncCursors, { deviceId: 'r2', lastSeq: 7 });
    await db.put(STORES.meta, [{ deviceId: 'r2', seq: 3 }], META_KEYS.deferredOps);

    const checkpoint = await recorder.queueCheckpoint({ createdAt: 'now' });
    // r2 has deferred ops, which the state does not contain, so it is not in the frontier.
    expect(checkpoint).toEqual({ startSeq: 5, endSeq: 7, frontier: { r1: 40 }, createdAt: 'now' });
    const ops = await db.getAll(STORES.outbox);
    expect(ops.map((o) => [o.seq, o.entity, o.id, Object.keys(o.fields).sort()])).toEqual([
      [5, 'accounts', 'a', ['createdAt']],
      [6, 'accounts', 'a', ['name']],
      // The tombstone goes out as a stub: the note written before the delete is dropped.
      [7, 'transactions', 't', ['deleted']],
    ]);
    expect(await db.getAll(STORES.syncCursors)).toHaveLength(2);
    expect(await db.get(STORES.meta, META_KEYS.pendingCheckpoint)).toEqual(checkpoint);
    expect(await db.get(STORES.meta, META_KEYS.localSeq)).toBe(7);
    // Local records are unchanged (stubbing happens only in the published ops).
    expect((await db.get(STORES.transactions, 't')).note).toBe('x');

    await db.clear(STORES.outbox);
    expect(await recorder.queueCheckpoint({ createdAt: 'later' })).toBeNull();
  });

  it('skips a checkpoint that would not shrink the log', async () => {
    const { db, recorder } = await createTestDb();
    await recorder.write({ entity: 'accounts', id: 'a', fields: { name: 'A' } });
    await recorder.write({ entity: 'accounts', id: 'b', fields: { name: 'B' } });
    await db.clear(STORES.outbox);
    expect(await recorder.queueCheckpoint({ createdAt: 'now', maxOps: 1 })).toBeNull();
    expect(await db.getAll(STORES.outbox)).toEqual([]);
    expect(await recorder.queueCheckpoint({ createdAt: 'now', maxOps: 2 })).not.toBeNull();
  });

  it('prunes old tombstones to stubs locally, without ops or events', async () => {
    const { db, recorder, feed } = await createTestDb();
    const at = (/** @type {number} */ wallMs) =>
      HybridLogicalClock.format({ wallMs, counter: 0, deviceId: 'r' });
    const day = 86_400_000;
    await recorder.write({
      entity: 'transactions',
      id: 'old',
      fields: { note: 'x', date: '2024-01-01', accountId: 'a', createdAt: 'c' },
      hlc: at(day),
    });
    await recorder.write({
      entity: 'transactions',
      id: 'old',
      fields: { deleted: true },
      hlc: at(2 * day),
    });
    await recorder.write({
      entity: 'transactions',
      id: 'recent',
      fields: { note: 'y' },
      hlc: at(40 * day),
    });
    await recorder.write({
      entity: 'transactions',
      id: 'recent',
      fields: { deleted: true },
      hlc: at(41 * day),
    });
    const outbox = (await db.getAll(STORES.outbox)).length;
    const events = vi.fn();
    feed.subscribe(events);

    expect(await recorder.pruneTombstones(45 * day)).toBe(1);
    expect(await db.get(STORES.transactions, 'old')).toEqual({
      id: 'old',
      deleted: true,
      _clocks: { deleted: at(2 * day) },
    });
    expect((await db.get(STORES.transactions, 'recent')).note).toBe('y');
    // The stub left the date and account indexes.
    expect(await db.getAllKeysFromIndex(STORES.transactions, 'accountId', 'a')).toEqual([]);
    expect((await db.getAll(STORES.outbox)).length).toBe(outbox);
    expect(events).not.toHaveBeenCalled();
    expect(await recorder.pruneTombstones(45 * day)).toBe(0);
  });

  it("raises other devices' cursors to a checkpoint frontier in the same transaction", async () => {
    const { db, recorder, deviceId } = await createTestDb();
    const hlc = HybridLogicalClock.format({ wallMs: 5, counter: 0, deviceId: 'r' });
    await db.put(STORES.syncCursors, { deviceId: 'ahead', lastSeq: 90 });
    const op = {
      v: 1,
      deviceId: 'r',
      seq: 1,
      hlc,
      entity: /** @type {const} */ ('accounts'),
      id: 'a',
      fields: { name: 'A' },
      origin: /** @type {const} */ ('user'),
    };
    await recorder.applyRemote(
      [op],
      { deviceId: 'r', lastSeq: 1 },
      {
        other: 50,
        ahead: 60,
        r: 999,
        [deviceId]: 999,
      },
    );
    const rows = await db.getAll(STORES.syncCursors);
    expect(rows.sort((a, b) => a.deviceId.localeCompare(b.deviceId))).toEqual([
      { deviceId: 'ahead', lastSeq: 90 },
      { deviceId: 'other', lastSeq: 50 },
      { deviceId: 'r', lastSeq: 1 },
    ]);
  });

  it('replays deferred ops once they are supported', async () => {
    const { db, recorder } = await createTestDb();
    const hlc = HybridLogicalClock.format({ wallMs: 5, counter: 0, deviceId: 'r' });
    const op = {
      v: 1,
      deviceId: 'r',
      seq: 1,
      hlc,
      entity: 'accounts',
      id: 'a',
      fields: { name: 'A' },
      origin: 'user',
    };
    await db.put(STORES.meta, [op], META_KEYS.deferredOps);
    expect(await recorder.replayDeferred()).toEqual(['accounts']);
    expect((await db.get(STORES.accounts, 'a')).name).toBe('A');
    expect(await db.get(STORES.meta, META_KEYS.deferredOps)).toEqual([]);
  });
});
