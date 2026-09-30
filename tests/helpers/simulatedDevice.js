import { SyncEngine } from '../../src/infrastructure/sync/SyncEngine.js';
import { WebDavClient } from '../../src/infrastructure/sync/webdav/WebDavClient.js';
import { canonicalJson } from '../../src/infrastructure/sync/merge.js';
import { STORES } from '../../src/infrastructure/db/database.js';
import { createTestServices } from './testServices.js';
import { FixedClock } from './FixedClock.js';
import { parseXml } from './xmlParser.js';

/** @typedef {import('./InMemoryWebDav.js').InMemoryWebDav} InMemoryWebDav */

/**
 * A simulated device: its own database, services, clock, and SyncEngine talking to a shared
 * in-memory WebDAV server.
 * @param {InMemoryWebDav} server
 * @param {string} name also used as the ID prefix for entities created on this device
 * @param {{ clockIso?: string, vaultPath?: string }} [options]
 */
export async function createDevice(server, name, options = {}) {
  const deviceId = `${name.toLowerCase()}0000000-0000-4000-8000-000000000000`.slice(0, 36);
  const clock = new FixedClock(options.clockIso ?? '2024-05-15T10:00:00.000Z');
  const t = await createTestServices({ deviceId, clock, idPrefix: name });
  await t.services.categories.seedDefaults();
  const client = new WebDavClient({
    http: server,
    credentials: server.credentials(options.vaultPath),
    parseXml,
  });
  /** @returns {SyncEngine} */
  const makeEngine = () =>
    new SyncEngine({
      db: t.db,
      recorder: t.recorder,
      transport: client,
      deviceId,
      getDeviceName: async () => name,
      afterPull: async () => {
        await t.services.recurring.materialize();
      },
      changeFeed: t.feed,
      nowIso: () => clock.nowIso(),
    });
  const device = {
    ...t,
    name,
    deviceId,
    client,
    engine: makeEngine(),
    /** Simulates an app restart: a fresh engine without cached server state. */
    restart() {
      device.engine = makeEngine();
    },
    sync() {
      return device.engine.sync();
    },
    /** Every stored record including clocks and tombstones, canonically serialized. */
    async snapshot() {
      return canonicalJson(await t.repos.backup.exportAll());
    },
    async outboxSize() {
      return (await t.db.getAll(STORES.outbox)).length;
    },
  };
  return device;
}

/**
 * Syncs every device repeatedly until a full round changes nothing.
 * @param {Array<Awaited<ReturnType<typeof createDevice>>>} devices
 * @returns {Promise<void>}
 */
export async function syncUntilQuiet(devices) {
  for (let round = 0; round < 10; round += 1) {
    let activity = 0;
    for (const device of devices) {
      const result = await device.sync();
      activity += result.pulled + result.pushed;
    }
    if (activity === 0) return;
  }
  throw new Error('Devices did not quiesce within 10 rounds');
}
