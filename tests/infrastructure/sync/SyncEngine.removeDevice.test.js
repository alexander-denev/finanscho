import { describe, expect, it } from 'vitest';
import { STORES } from '../../../src/infrastructure/db/database.js';
import { InMemoryWebDav } from '../../helpers/InMemoryWebDav.js';
import { createDevice, syncUntilQuiet } from '../../helpers/simulatedDevice.js';

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

/** @param {Device} device */
async function accountNames(device) {
  return (await device.services.accounts.list()).map((a) => a.name);
}

/**
 * @param {InMemoryWebDav} server
 * @param {Device} device
 */
function folderExists(server, device) {
  return server.collections.has(server.vaultPath(`devices/${device.deviceId}`));
}

describe('SyncEngine device removal', () => {
  it('lists the devices of the vault with their sync state', async () => {
    const server = new InMemoryWebDav();
    const a = await createDevice(server, 'A');
    const b = await createDevice(server, 'B');
    await addAccount(b, 'From B');
    await b.sync();
    expect(a.engine.devices()).toEqual([]);
    await a.sync();
    expect(a.engine.devices()).toEqual([
      expect.objectContaining({ deviceId: a.deviceId, deviceName: 'A', isSelf: true }),
      {
        deviceId: b.deviceId,
        deviceName: 'B',
        lastSeenAt: '2024-05-15T10:00:00.000Z',
        fullySynced: true,
        isSelf: false,
      },
    ]);
  });

  it('refuses to remove a device whose changes are not all applied here', async () => {
    const server = new InMemoryWebDav();
    const a = await createDevice(server, 'A');
    const b = await createDevice(server, 'B');
    await addAccount(b, 'Unread');
    await b.sync();
    const segment = [...server.files.keys()].find((p) => p.includes(`${b.deviceId}/ops/`)) ?? '';
    const good = server.files.get(segment) ?? '';
    server.files.set(segment, 'not json');

    await expect(a.engine.removeDevice(b.deviceId)).rejects.toMatchObject({
      reason: 'removeIncomplete',
    });
    expect(folderExists(server, b)).toBe(true);
    await a.sync();
    expect(a.engine.devices().find((d) => d.deviceId === b.deviceId)?.fullySynced).toBe(false);

    server.files.set(segment, good);
    await a.engine.removeDevice(b.deviceId);
    expect(folderExists(server, b)).toBe(false);
    expect(await a.db.get(STORES.syncCursors, b.deviceId)).toBeUndefined();
    expect(await accountNames(a)).toEqual(['Unread']);
  });

  it('refuses while ops from that device are deferred for a newer app version', async () => {
    const server = new InMemoryWebDav();
    const a = await createDevice(server, 'A');
    const b = await createDevice(server, 'B');
    await b.recorder.write({ entity: 'accounts', id: 'x', fields: { name: 'X', createdAt: 't' } });
    const outbox = await b.db.getAll(STORES.outbox);
    await b.db.put(STORES.outbox, {
      ...outbox[outbox.length - 1],
      entity: 'goals',
      id: 'g',
      seq: outbox.length + 1,
    });
    await b.sync();
    await expect(a.engine.removeDevice(b.deviceId)).rejects.toMatchObject({
      reason: 'removeIncomplete',
    });
    expect(folderExists(server, b)).toBe(true);
  });

  it('passes a removed device’s data to a third device that had not read it yet', async () => {
    const server = new InMemoryWebDav();
    const a = await createDevice(server, 'A');
    const b = await createDevice(server, 'B');
    const c = await createDevice(server, 'C');
    await syncUntilQuiet([a, b, c]);
    // B's last changes reach A but not C before B is retired.
    await addAccount(b, 'Old phone data');
    const account = await addAccount(a, 'Edited');
    await b.sync();

    await a.engine.removeDevice(b.deviceId);
    expect(folderExists(server, b)).toBe(false);
    expect(server.readJson(`devices/${a.deviceId}/head.json`).checkpoint).toBeDefined();

    await c.sync();
    expect(await accountNames(c)).toEqual(['Edited', 'Old phone data']);
    expect(await c.snapshot()).toBe(await a.snapshot());
    expect(c.engine.devices().map((d) => d.deviceName)).toEqual(['C', 'A']);
    expect(await c.db.get(STORES.syncCursors, b.deviceId)).toBeUndefined();
    expect(account).toBeDefined();
  });

  it('lets a removed device that is still in use upload its full state again; deletes still win', async () => {
    const server = new InMemoryWebDav();
    const a = await createDevice(server, 'A');
    const b = await createDevice(server, 'B');
    await addAccount(b, 'Kept');
    const doomed = await b.services.transactions.create({
      kind: 'expense',
      date: '2024-05-10',
      amount: '5',
      accountId: (await addAccount(b, 'Joint')).id,
      categoryId: 'seed:groceries',
    });
    await syncUntilQuiet([a, b]);

    await a.engine.removeDevice(b.deviceId);
    a.clock.advance(60_000);
    await a.services.transactions.remove(doomed.id);
    await a.sync();

    // B never heard about its removal: its next push finds its folder gone.
    await addAccount(b, 'After removal');
    await b.sync();
    expect(folderExists(server, b)).toBe(true);
    expect(server.readJson(`devices/${b.deviceId}/head.json`).lastSeq).toBeGreaterThan(0);

    await syncUntilQuiet([a, b]);
    expect(await accountNames(a)).toEqual(['After removal', 'Joint', 'Kept']);
    expect(await a.services.transactions.get(doomed.id).catch(() => null)).toBeNull();
    expect(await b.services.transactions.get(doomed.id).catch(() => null)).toBeNull();
    expect(await b.stubSnapshot()).toBe(await a.stubSnapshot());
  });

  it('treats removing a device that is already gone as done', async () => {
    const server = new InMemoryWebDav();
    const a = await createDevice(server, 'A');
    await a.sync();
    await a.db.put(STORES.syncCursors, { deviceId: 'gone', lastSeq: 3 });
    await expect(a.engine.removeDevice('gone')).resolves.toBeUndefined();
    expect(await a.db.get(STORES.syncCursors, 'gone')).toBeUndefined();
    await expect(a.engine.removeDevice(a.deviceId)).rejects.toMatchObject({
      reason: 'removeIncomplete',
    });
  });
});
