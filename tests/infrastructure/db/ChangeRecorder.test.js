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
