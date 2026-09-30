import { describe, expect, it } from 'vitest';
import { STORES } from '../../../src/infrastructure/db/database.js';
import { segmentFileName } from '../../../src/infrastructure/sync/operation.js';
import { InMemoryWebDav, networkError } from '../../helpers/InMemoryWebDav.js';
import { createDevice, syncUntilQuiet } from '../../helpers/simulatedDevice.js';

/**
 * @param {Awaited<ReturnType<typeof createDevice>>} device
 * @param {string} name
 */
async function addAccount(device, name) {
  return device.services.accounts.create({
    name,
    type: 'cash',
    currency: 'EUR',
    openingBalance: '1',
  });
}

describe('SyncEngine', () => {
  it('creates the vault and publishes a segment, then the head, then trims the outbox', async () => {
    const server = new InMemoryWebDav();
    const a = await createDevice(server, 'A');
    await addAccount(a, 'Wallet');
    const queued = await a.outboxSize();
    const result = await a.sync();
    expect(result).toMatchObject({ pulled: 0, pushed: queued, issues: [] });
    expect(server.readJson('vault.json')).toMatchObject({ format: 1 });
    const head = server.readJson(`devices/${a.deviceId}/head.json`);
    expect(head).toMatchObject({ deviceId: a.deviceId, deviceName: 'A', lastSeq: queued });
    expect(head.segments).toEqual([
      { file: segmentFileName(1, queued), startSeq: 1, endSeq: queued },
    ]);
    const puts = server.log.filter((r) => r.method === 'PUT').map((r) => r.path.split('/').pop());
    expect(puts.indexOf(head.segments[0].file)).toBeLessThan(puts.indexOf('head.json'));
    expect(await a.outboxSize()).toBe(0);
  });

  it('exchanges data between devices and does not refetch applied segments', async () => {
    const server = new InMemoryWebDav();
    const a = await createDevice(server, 'A');
    const b = await createDevice(server, 'B');
    await addAccount(a, 'From A');
    await addAccount(b, 'From B');
    await syncUntilQuiet([a, b]);
    expect((await a.services.accounts.list()).map((x) => x.name)).toEqual(['From A', 'From B']);
    expect(await a.snapshot()).toBe(await b.snapshot());
    server.log.length = 0;
    await b.sync();
    expect(server.log.some((r) => r.method === 'GET' && r.path.includes('/ops/'))).toBe(false);
  });

  it('splits large outboxes into segments of at most 500 ops', async () => {
    const server = new InMemoryWebDav();
    const a = await createDevice(server, 'A');
    const account = await addAccount(a, 'Busy');
    for (let i = 0; i < 520; i += 1) {
      await a.services.accounts.update(account.id, {
        name: `Busy ${i}`,
        type: 'cash',
        currency: 'EUR',
        openingBalance: '1',
      });
    }
    const total = await a.outboxSize();
    await a.sync();
    const head = server.readJson(`devices/${a.deviceId}/head.json`);
    expect(head.segments.map((/** @type {{ endSeq: number }} */ s) => s.endSeq)).toEqual([
      500,
      total,
    ]);
    const b = await createDevice(server, 'B');
    await b.sync();
    expect((await b.services.accounts.get(account.id)).name).toBe('Busy 519');
  });

  it('survives a crash between the segment PUT and the head PUT', async () => {
    const server = new InMemoryWebDav();
    const a = await createDevice(server, 'A');
    const b = await createDevice(server, 'B');
    await syncUntilQuiet([a, b]);
    await addAccount(a, 'Crash test');
    server.failNext({
      method: 'PUT',
      pathIncludes: `${a.deviceId}/head.json`,
      error: networkError(),
    });
    await expect(a.sync()).rejects.toMatchObject({ reason: 'network' });
    // The segment exists on the server, but no head points at it and the outbox is intact.
    const head = server.readJson(`devices/${a.deviceId}/head.json`);
    const orphan = [...server.files.keys()].filter((p) => p.includes(`${a.deviceId}/ops/`));
    expect(orphan.length).toBe(head.segments.length + 1);
    expect(await a.outboxSize()).toBeGreaterThan(0);
    await b.sync();
    expect(await b.services.accounts.list()).toEqual([]);
    a.restart();
    await syncUntilQuiet([a, b]);
    expect((await b.services.accounts.list()).map((x) => x.name)).toEqual(['Crash test']);
    expect(await a.snapshot()).toBe(await b.snapshot());
  });

  it('trims already-published ops after a crash between the head PUT and the outbox trim', async () => {
    const server = new InMemoryWebDav();
    const a = await createDevice(server, 'A');
    await addAccount(a, 'Published');
    const ops = await a.db.getAll(STORES.outbox);
    await a.sync();
    for (const op of ops) await a.db.put(STORES.outbox, op);
    a.restart();
    server.log.length = 0;
    const result = await a.sync();
    expect(result.pushed).toBe(0);
    expect(server.log.filter((r) => r.method === 'PUT')).toEqual([]);
    expect(await a.outboxSize()).toBe(0);
  });

  it('is idempotent under duplicate delivery', async () => {
    const server = new InMemoryWebDav();
    const a = await createDevice(server, 'A');
    const b = await createDevice(server, 'B');
    await addAccount(a, 'Once');
    await syncUntilQuiet([a, b]);
    const before = await b.snapshot();
    await b.db.clear(STORES.syncCursors);
    const again = await b.sync();
    expect(again.pulled).toBeGreaterThan(0);
    expect(await b.snapshot()).toBe(before);
  });

  it('skips and reports malformed segments and heads without crashing, then recovers', async () => {
    const server = new InMemoryWebDav();
    const a = await createDevice(server, 'A');
    const c = await createDevice(server, 'C');
    const b = await createDevice(server, 'B');
    await addAccount(a, 'From A');
    await addAccount(c, 'From C');
    await a.sync();
    await c.sync();
    const segmentPath = [...server.files.keys()].find((p) => p.includes(`${a.deviceId}/ops/`));
    if (!segmentPath) throw new Error('no segment');
    const good = server.files.get(segmentPath) ?? '';
    server.files.set(segmentPath, '[{"broken": true}]');
    const result = await b.sync();
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toContain(a.deviceId);
    expect((await b.services.accounts.list()).map((x) => x.name)).toEqual(['From C']);
    server.files.set(segmentPath, good);
    await b.sync();
    expect((await b.services.accounts.list()).map((x) => x.name)).toEqual(['From A', 'From C']);

    server.files.set(server.vaultPath(`devices/${c.deviceId}/head.json`), '{"nope":1}');
    expect((await b.sync()).issues).toEqual([`devices/${c.deviceId}/head.json is malformed`]);
  });

  it('refuses to touch a vault with a newer format', async () => {
    const server = new InMemoryWebDav();
    const a = await createDevice(server, 'A');
    await a.client.ensureCollection('');
    await a.client.put('vault.json', JSON.stringify({ format: 2, createdAt: 'x' }));
    await addAccount(a, 'Local only');
    server.log.length = 0;
    await expect(a.sync()).rejects.toMatchObject({ reason: 'vaultTooNew' });
    expect(server.log.every((r) => r.method === 'GET')).toBe(true);
    expect(await a.outboxSize()).toBeGreaterThan(0);
  });

  it('runs one cycle at a time and coalesces concurrent requests', async () => {
    const server = new InMemoryWebDav();
    const a = await createDevice(server, 'A');
    await addAccount(a, 'x');
    const [r1, r2, r3] = await Promise.all([a.sync(), a.sync(), a.sync()]);
    expect(r1).toBe(r2);
    expect(r2).toBe(r3);
    const vaultGets = server.log.filter((r) => r.method === 'GET' && r.path.endsWith('vault.json'));
    expect(vaultGets).toHaveLength(2);
  });

  it('republishes its full state when the server lost already-trimmed ops', async () => {
    const server = new InMemoryWebDav();
    const a = await createDevice(server, 'A');
    await addAccount(a, 'Before restore');
    await a.sync();
    // The server is restored from a backup taken before A's first push.
    for (const path of [...server.files.keys()])
      if (path.includes('/devices/')) server.files.delete(path);
    await addAccount(a, 'After restore');
    a.restart();
    await a.sync();
    const b = await createDevice(server, 'B');
    await b.sync();
    expect((await b.services.accounts.list()).map((x) => x.name)).toEqual([
      'After restore',
      'Before restore',
    ]);
  });

  it('defers ops from newer clients and keeps syncing', async () => {
    const server = new InMemoryWebDav();
    const a = await createDevice(server, 'A');
    const b = await createDevice(server, 'B');
    await a.recorder.write({ entity: 'accounts', id: 'x', fields: { name: 'X', createdAt: 't' } });
    const outbox = await a.db.getAll(STORES.outbox);
    await a.db.put(STORES.outbox, {
      ...outbox[outbox.length - 1],
      entity: 'goals',
      id: 'g',
      seq: outbox.length + 1,
    });
    await a.sync();
    const result = await b.sync();
    expect(result.deferred).toBe(1);
    expect((await b.services.accounts.get('x'))?.name).toBe('X');
  });
});
