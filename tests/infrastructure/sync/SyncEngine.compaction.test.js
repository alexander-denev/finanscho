import { describe, expect, it } from 'vitest';
import { META_KEYS } from '../../../src/infrastructure/db/ChangeRecorder.js';
import { STORES } from '../../../src/infrastructure/db/database.js';
import { segmentFileName } from '../../../src/infrastructure/sync/operation.js';
import { InMemoryWebDav, networkError } from '../../helpers/InMemoryWebDav.js';
import { createDevice, syncUntilQuiet, withoutCheckpoints } from '../../helpers/simulatedDevice.js';

/** @typedef {Awaited<ReturnType<typeof createDevice>>} Device */

/**
 * @param {Device} device
 * @param {string} name
 */
function addAccount(device, name) {
  return device.services.accounts.create({
    name,
    type: 'cash',
    currency: 'EUR',
    openingBalance: '1',
  });
}

/**
 * Renames an account `times` times: many ops, constant state size.
 * @param {Device} device
 * @param {string} accountId
 * @param {number} times
 */
async function churn(device, accountId, times) {
  for (let i = 0; i < times; i += 1) {
    await device.services.accounts.update(accountId, {
      name: `${device.name} ${i}`,
      type: 'cash',
      currency: 'EUR',
      openingBalance: '1',
    });
  }
}

/**
 * @param {InMemoryWebDav} server
 * @param {Device} device
 */
function head(server, device) {
  return server.readJson(`devices/${device.deviceId}/head.json`);
}

/**
 * Segment file names stored on the server for a device.
 * @param {InMemoryWebDav} server
 * @param {Device} device
 */
function opsFiles(server, device) {
  const prefix = server.vaultPath(`devices/${device.deviceId}/ops/`);
  return [...server.files.keys()]
    .filter((p) => p.startsWith(prefix))
    .map((p) => p.slice(prefix.length))
    .sort();
}

/**
 * @param {InMemoryWebDav} server
 * @param {Device} device
 */
function segmentGets(server, device) {
  return server.log.filter(
    (r) => r.method === 'GET' && r.path.includes(`devices/${device.deviceId}/ops/`),
  ).length;
}

describe('SyncEngine compaction', () => {
  it('publishes a checkpoint, trims the head to it, deletes superseded files, and carries it on', async () => {
    const server = new InMemoryWebDav();
    const a = await createDevice(server, 'A', { compactMinOps: 20 });
    const account = await addAccount(a, 'Churn');
    await churn(a, account.id, 10);
    const before = await a.outboxSize();

    const result = await a.sync();
    expect(result).toMatchObject({ compacted: true, cleanupBlocked: false, cleanupIssues: [] });
    const compacted = head(server, a);
    expect(compacted.checkpoint).toMatchObject({ startSeq: before + 1, frontier: {} });
    expect(compacted.segments[0].startSeq).toBe(compacted.checkpoint.startSeq);
    expect(compacted.segments.at(-1).endSeq).toBe(compacted.checkpoint.endSeq);
    // The checkpoint is the state, which is smaller than the log it replaces.
    expect(compacted.checkpoint.endSeq - compacted.checkpoint.startSeq + 1).toBeLessThan(before);
    expect(opsFiles(server, a)).toEqual(compacted.segments.map((/** @type {any} */ s) => s.file));
    expect(await a.outboxSize()).toBe(0);
    expect(await a.db.get(STORES.meta, META_KEYS.pendingCheckpoint)).toBeUndefined();
    expect(await a.db.get(STORES.meta, META_KEYS.gcPending)).toBeUndefined();

    // Later heads keep the checkpoint and append after it.
    await addAccount(a, 'After');
    await a.sync();
    const later = head(server, a);
    expect(later.checkpoint).toEqual(compacted.checkpoint);
    expect(later.segments.slice(0, compacted.segments.length)).toEqual(compacted.segments);

    const b = await createDevice(server, 'B');
    await b.sync();
    expect(await b.snapshot()).toBe(await a.snapshot());
  });

  it('lets readers with a mid-log cursor converge, with or without checkpoint support', async () => {
    const server = new InMemoryWebDav();
    const a = await createDevice(server, 'A', { compactMinOps: 20 });
    const b = await createDevice(server, 'B');
    const old = await createDevice(server, 'C', { transport: withoutCheckpoints });
    const account = await addAccount(a, 'Shared');
    const tx = await a.services.transactions.create({
      kind: 'expense',
      date: '2024-05-10',
      amount: '12',
      accountId: account.id,
      categoryId: 'seed:groceries',
    });
    await syncUntilQuiet([a, b, old]);

    // While B and C are away, A deletes the transaction and churns past the threshold. The ops in
    // between are trimmed from the server; the checkpoint carries their effect (a tombstone stub).
    await a.services.transactions.remove(tx.id);
    await churn(a, account.id, 25);
    expect((await a.sync()).compacted).toBe(true);
    expect(head(server, a).segments[0].startSeq).toBeGreaterThan(20);

    await syncUntilQuiet([a, b, old]);
    expect(await b.snapshot()).toBe(await a.snapshot());
    expect(await old.snapshot()).toBe(await a.snapshot());
    expect(await b.services.transactions.get(tx.id).catch(() => null)).toBeNull();

    // A new device sees only the stub of the deleted transaction, which hides it just the same.
    const fresh = await createDevice(server, 'D');
    await fresh.sync();
    expect(await fresh.stubSnapshot()).toBe(await a.stubSnapshot());
    expect(await fresh.services.transactions.get(tx.id).catch(() => null)).toBeNull();
  });

  it('recovers from a crash after a checkpoint segment PUT, before its head PUT', async () => {
    const server = new InMemoryWebDav();
    const a = await createDevice(server, 'A');
    const b = await createDevice(server, 'B');
    const account = await addAccount(a, 'Crash');
    await churn(a, account.id, 30);
    await syncUntilQuiet([a, b]);
    const checkpoint = await a.recorder.queueCheckpoint({ createdAt: a.clock.nowIso() });
    expect(checkpoint).not.toBeNull();
    server.failNext({
      method: 'PUT',
      pathIncludes: `${a.deviceId}/head.json`,
      error: networkError(),
    });
    await expect(a.sync()).rejects.toMatchObject({ reason: 'network' });
    expect(head(server, a).checkpoint).toBeUndefined();
    expect(await a.db.get(STORES.meta, META_KEYS.pendingCheckpoint)).toEqual(checkpoint);

    a.restart();
    await a.sync();
    expect(head(server, a).checkpoint).toEqual(checkpoint);
    expect(opsFiles(server, a)).toEqual([
      segmentFileName(checkpoint?.startSeq ?? 0, checkpoint?.endSeq ?? 0),
    ]);
    await churn(a, account.id, 1);
    await syncUntilQuiet([a, b]);
    expect(await b.snapshot()).toBe(await a.snapshot());
  });

  it('recovers from a crash after the checkpoint head PUT, before the trim and pending clear', async () => {
    const server = new InMemoryWebDav();
    const a = await createDevice(server, 'A');
    const account = await addAccount(a, 'Crash');
    await churn(a, account.id, 30);
    await a.sync();
    const checkpoint = await a.recorder.queueCheckpoint({ createdAt: a.clock.nowIso() });
    const queued = await a.db.getAll(STORES.outbox);
    await a.sync();
    // Put the device back into the state right after the head PUT.
    for (const op of queued) await a.db.put(STORES.outbox, op);
    await a.db.put(STORES.meta, checkpoint, META_KEYS.pendingCheckpoint);
    a.restart();
    server.log.length = 0;

    const result = await a.sync();
    expect(result.pushed).toBe(0);
    expect(server.log.filter((r) => r.method === 'PUT')).toEqual([]);
    expect(await a.outboxSize()).toBe(0);
    expect(await a.db.get(STORES.meta, META_KEYS.pendingCheckpoint)).toBeUndefined();
    expect(await a.db.get(STORES.meta, META_KEYS.gcPending)).toBeUndefined();
    expect(head(server, a).checkpoint).toEqual(checkpoint);
  });

  it('keeps local writes made while a checkpoint is queued, after the checkpoint', async () => {
    const server = new InMemoryWebDav();
    const a = await createDevice(server, 'A');
    await addAccount(a, 'First');
    await a.sync();
    const [checkpoint, concurrent] = await Promise.all([
      a.recorder.queueCheckpoint({ createdAt: a.clock.nowIso() }),
      addAccount(a, 'Concurrent'),
    ]);
    const ops = /** @type {import('../../../src/infrastructure/sync/operation.js').Op[]} */ (
      await a.db.getAll(STORES.outbox)
    );
    const write = ops.find((op) => op.id === concurrent.id);
    expect(checkpoint).not.toBeNull();
    expect(write?.seq).toBeGreaterThan(checkpoint?.endSeq ?? Infinity);
    await a.sync();
    expect(head(server, a).checkpoint).toEqual(checkpoint);

    const b = await createDevice(server, 'B');
    await b.sync();
    expect((await b.services.accounts.list()).map((x) => x.name)).toEqual(['Concurrent', 'First']);
  });

  it.each([
    ['refused with 405', { status: 405 }],
    ['blocked by CORS (network error)', { error: networkError() }],
  ])('treats a DELETE %s as a cleanup issue, not a sync error', async (_label, failure) => {
    const server = new InMemoryWebDav();
    const a = await createDevice(server, 'A', { compactMinOps: 20 });
    const account = await addAccount(a, 'Blocked');
    await churn(a, account.id, 10);
    server.failNext({ method: 'DELETE', pathIncludes: `${a.deviceId}/ops/`, ...failure });

    const blocked = await a.sync();
    expect(blocked).toMatchObject({ compacted: true, cleanupBlocked: true, issues: [] });
    expect(blocked.cleanupIssues).toHaveLength(1);
    expect(opsFiles(server, a).length).toBeGreaterThan(head(server, a).segments.length);
    expect(await a.db.get(STORES.meta, META_KEYS.gcPending)).toBe(true);

    const retried = await a.sync();
    expect(retried).toMatchObject({ cleanupBlocked: false, cleanupIssues: [] });
    expect(opsFiles(server, a)).toEqual(
      head(server, a).segments.map((/** @type {any} */ s) => s.file),
    );
  });

  it('collects orphan files from crashed pushes on "Clean up server data"', async () => {
    const server = new InMemoryWebDav();
    const a = await createDevice(server, 'A');
    await addAccount(a, 'Orphans');
    await a.sync();
    const { lastSeq, segments } = head(server, a);
    const orphan = segmentFileName(1, 2);
    const future = segmentFileName(lastSeq + 1, lastSeq + 3);
    for (const file of [orphan, future]) {
      server.files.set(server.vaultPath(`devices/${a.deviceId}/ops/${file}`), '[]');
    }
    const result = await a.engine.compactNow();
    // Small logs are not compacted: the checkpoint would not be smaller.
    expect(result.compacted).toBe(false);
    expect(opsFiles(server, a)).toEqual(
      [...segments.map((/** @type {any} */ s) => s.file), future].sort(),
    );
  });

  it('bootstraps a new device from a checkpoint frontier, downloading fewer segments', async () => {
    const server = new InMemoryWebDav();
    const a = await createDevice(server, 'A', { compactMinOps: 20 });
    const b = await createDevice(server, 'B');
    const busy = await addAccount(b, 'Busy');
    await churn(b, busy.id, 600);
    await syncUntilQuiet([b, a]);
    const account = await addAccount(a, 'Compacting');
    await churn(a, account.id, 40);
    expect((await a.sync()).compacted).toBe(true);
    expect(head(server, a).checkpoint.frontier).toEqual({ [b.deviceId]: head(server, b).lastSeq });
    expect(head(server, b).segments.length).toBeGreaterThan(1);

    server.log.length = 0;
    const fresh = await createDevice(server, 'C');
    await fresh.sync();
    expect(segmentGets(server, b)).toBe(0);
    expect(await fresh.snapshot()).toBe(await a.snapshot());

    server.log.length = 0;
    const old = await createDevice(server, 'D', { transport: withoutCheckpoints });
    await old.sync();
    expect(segmentGets(server, b)).toBe(head(server, b).segments.length);
    expect(await old.snapshot()).toBe(await a.snapshot());
  });

  it('keeps tombstone fields written after the delete, so a later un-delete converges', async () => {
    // Today budgets are only rewritten in full, but a newer client may send a partial edit. Here a
    // partial edit (Y) is newer than both the delete (X) and an un-deleting rewrite (Z), and Y
    // checkpoints while the budget is still deleted on Y.
    const server = new InMemoryWebDav();
    const x = await createDevice(server, 'X');
    const y = await createDevice(server, 'Y');
    const z = await createDevice(server, 'Z');
    const id = 'seed:groceries:2024-05';
    await x.services.budgets.set({ categoryId: 'seed:groceries', month: '2024-05', limit: '100' });
    await syncUntilQuiet([x, y, z]);

    x.clock.advance(60_000);
    await x.services.budgets.remove(id);
    await x.sync();
    y.clock.advance(180_000);
    await y.sync();
    await y.recorder.write({
      entity: 'budgets',
      id,
      fields: { limitMinor: 77_700, updatedAt: y.clock.nowIso() },
    });
    await y.sync();
    await x.sync();
    z.clock.advance(120_000);
    await z.services.budgets.set({ categoryId: 'seed:groceries', month: '2024-05', limit: '250' });

    const account = await addAccount(y, 'Churn');
    await churn(y, account.id, 40);
    await y.sync();
    expect((await y.engine.compactNow()).compacted).toBe(true);

    await syncUntilQuiet([x, y, z]);
    const fresh = await createDevice(server, 'N');
    await fresh.sync();
    for (const device of [x, y, z, fresh]) {
      const [line] = (await device.services.budgets.forMonth('2024-05')).lines;
      expect(line?.budget.limitMinor).toBe(77_700);
    }
    const snapshot = await x.stubSnapshot();
    for (const device of [y, z, fresh]) expect(await device.stubSnapshot()).toBe(snapshot);
  });

  it('leaves devices with deferred ops out of the frontier', async () => {
    const server = new InMemoryWebDav();
    const a = await createDevice(server, 'A');
    const b = await createDevice(server, 'B');
    const c = await createDevice(server, 'C');
    await a.recorder.write({ entity: 'accounts', id: 'x', fields: { name: 'X', createdAt: 't' } });
    const outbox = await a.db.getAll(STORES.outbox);
    await a.db.put(STORES.outbox, {
      ...outbox[outbox.length - 1],
      entity: 'goals',
      id: 'g',
      seq: outbox.length + 1,
    });
    await addAccount(c, 'From C');
    await a.sync();
    await c.sync();
    expect((await b.sync()).deferred).toBe(1);

    const account = await addAccount(b, 'Compacting');
    await churn(b, account.id, 30);
    await b.sync();
    expect((await b.engine.compactNow()).compacted).toBe(true);
    const { frontier } = head(server, b).checkpoint;
    expect(frontier).toEqual({ [c.deviceId]: head(server, c).lastSeq });
  });
});
