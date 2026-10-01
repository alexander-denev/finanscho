import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BACKOFF_MAX_MS,
  DEBOUNCE_MS,
  INTERVAL_MS,
  SyncScheduler,
  vaultIdentity,
} from '../../../src/infrastructure/sync/SyncScheduler.js';
import { SyncError } from '../../../src/core/errors.js';
import { ChangeFeed } from '../../../src/shared/ChangeFeed.js';

const creds = { url: 'https://dav.test/dav', vaultPath: 'finanscho', username: 'u', password: 'p' };
const ok = {
  pulled: 0,
  pushed: 0,
  deferred: 0,
  issues: [],
  cleanupIssues: /** @type {string[]} */ ([]),
  cleanupBlocked: false,
  compacted: false,
};

function setup({ stored = /** @type {typeof creds | null} */ (creds) } = {}) {
  /** @type {Map<string, unknown>} */
  const settings = new Map();
  let saved = stored;
  /** @type {Array<() => void>} */
  const resume = [];
  /** @type {Array<() => void>} */
  const pause = [];
  const engine = {
    sync: vi.fn(async () => ok),
    compactNow: vi.fn(async () => ({ ...ok, compacted: true })),
    removeDevice: vi.fn(async (/** @type {string} */ _id) => {}),
    devices: vi.fn(() => [
      { deviceId: 'me', deviceName: 'Me', lastSeenAt: null, fullySynced: true, isSelf: true },
    ]),
  };
  const client = {
    checkAccess: vi.fn(async () => {}),
    get: vi.fn(async () => /** @type {string | null} */ (null)),
  };
  const feed = new ChangeFeed();
  const onVaultChange = vi.fn(async () => 0);
  const scheduler = new SyncScheduler({
    credentials: {
      load: async () => saved,
      save: async (c) => {
        saved = c;
      },
      clear: async () => {
        saved = null;
      },
    },
    settings: { get: async (k) => settings.get(k), set: async (k, v) => void settings.set(k, v) },
    changeFeed: feed,
    createEngine: () => engine,
    createClient: () => client,
    onVaultChange,
    lifecycle: {
      onResume: (fn) => {
        resume.push(fn);
        return () => {};
      },
      onPause: (fn) => {
        pause.push(fn);
        return () => {};
      },
    },
    nowIso: () => new Date().toISOString(),
  });
  return { scheduler, engine, client, feed, settings, resume, pause, onVaultChange };
}

describe('SyncScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-05-15T10:00:00.000Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('stays disabled without credentials', async () => {
    const { scheduler, engine, feed } = setup({ stored: null });
    await scheduler.start();
    feed.publish({ entities: ['accounts'], source: 'local' });
    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 2);
    expect(engine.sync).not.toHaveBeenCalled();
    expect(scheduler.getStatus().state).toBe('disabled');
  });

  it('runs cleanup, lists devices, and removes a device with a follow-up sync', async () => {
    const { scheduler, engine } = setup();
    expect(scheduler.listDevices()).toEqual([]);
    await scheduler.start();
    expect(scheduler.listDevices().map((d) => d.deviceId)).toEqual(['me']);
    await scheduler.compactNow();
    expect(engine.compactNow).toHaveBeenCalledTimes(1);
    expect(scheduler.getStatus().state).toBe('idle');
    await scheduler.removeDevice('old');
    expect(engine.removeDevice).toHaveBeenCalledWith('old');
    expect(engine.sync).toHaveBeenCalledTimes(2);

    engine.removeDevice.mockRejectedValueOnce(new SyncError('removeIncomplete'));
    await expect(scheduler.removeDevice('old')).rejects.toMatchObject({
      reason: 'removeIncomplete',
    });
    await scheduler.configure(null);
    await expect(scheduler.removeDevice('old')).rejects.toMatchObject({ reason: 'notConfigured' });
  });

  it('reports blocked cleanup in the status without treating it as a sync error', async () => {
    const { scheduler, engine } = setup();
    engine.sync.mockResolvedValueOnce({
      ...ok,
      cleanupIssues: ['DELETE refused'],
      cleanupBlocked: true,
    });
    await scheduler.start();
    expect(scheduler.getStatus()).toMatchObject({
      state: 'idle',
      reason: null,
      issues: 0,
      cleanupBlocked: true,
    });
    await scheduler.syncNow();
    expect(scheduler.getStatus().cleanupBlocked).toBe(false);
  });

  it('syncs on start, on resume, 5 s after local writes, and every 5 minutes', async () => {
    const { scheduler, engine, feed, resume, pause } = setup();
    const statuses = /** @type {string[]} */ ([]);
    scheduler.subscribe((s) => statuses.push(s.state));
    await scheduler.start();
    expect(engine.sync).toHaveBeenCalledTimes(1);
    expect(scheduler.getStatus()).toMatchObject({
      state: 'idle',
      lastSyncedAt: '2024-05-15T10:00:00.000Z',
    });
    expect(statuses).toContain('syncing');

    feed.publish({ entities: ['transactions'], source: 'local' });
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS - 1);
    feed.publish({ entities: ['transactions'], source: 'local' });
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS - 1);
    expect(engine.sync).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(engine.sync).toHaveBeenCalledTimes(2);

    feed.publish({ entities: ['transactions'], source: 'remote' });
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(engine.sync).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    expect(engine.sync).toHaveBeenCalledTimes(3);

    pause.forEach((fn) => fn());
    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 3);
    expect(engine.sync).toHaveBeenCalledTimes(3);
    resume.forEach((fn) => fn());
    await vi.advanceTimersByTimeAsync(0);
    expect(engine.sync).toHaveBeenCalledTimes(4);
    scheduler.stop();
  });

  it('backs off exponentially on transient errors, capped at 5 minutes', async () => {
    const { scheduler, engine } = setup();
    engine.sync.mockRejectedValue(new SyncError('network', 'down'));
    await scheduler.start();
    expect(scheduler.getStatus()).toMatchObject({ state: 'error', reason: 'network' });
    const calls = () => engine.sync.mock.calls.length;
    for (const delay of [5_000, 10_000, 20_000, 40_000, 80_000, 160_000, BACKOFF_MAX_MS]) {
      const before = calls();
      await vi.advanceTimersByTimeAsync(delay - 1);
      // The 5-minute interval may also fire; only check that the backoff retry arrives on time.
      await vi.advanceTimersByTimeAsync(1);
      expect(calls()).toBeGreaterThan(before);
    }
    engine.sync.mockResolvedValue(ok);
    await vi.advanceTimersByTimeAsync(BACKOFF_MAX_MS);
    expect(scheduler.getStatus().state).toBe('idle');
    scheduler.stop();
  });

  it('reports offline and does not auto-retry permanent errors', async () => {
    const { scheduler, engine } = setup();
    engine.sync.mockRejectedValueOnce(new SyncError('offline'));
    await scheduler.start();
    expect(scheduler.getStatus()).toMatchObject({ state: 'offline', reason: 'offline' });

    engine.sync.mockRejectedValue(new SyncError('auth'));
    await vi.advanceTimersByTimeAsync(5_000);
    expect(scheduler.getStatus()).toMatchObject({ state: 'error', reason: 'auth' });
    const count = engine.sync.mock.calls.length;
    // No backoff retry: nothing runs until the regular 5-minute interval (started at t = 0).
    await vi.advanceTimersByTimeAsync(INTERVAL_MS - 5_000 - 1);
    expect(engine.sync.mock.calls.length).toBe(count);
    scheduler.stop();
  });

  it('re-queues data when switching to a different vault, and disables on clear', async () => {
    const { scheduler, onVaultChange, settings } = setup();
    await scheduler.start();
    expect(settings.get('syncedVault')).toBe(vaultIdentity(creds));
    await scheduler.configure({ ...creds, url: 'https://dav.test/dav/' });
    expect(onVaultChange).not.toHaveBeenCalled();
    await scheduler.configure({ ...creds, vaultPath: 'other' });
    expect(onVaultChange).toHaveBeenCalledTimes(1);
    await scheduler.configure(null);
    expect(scheduler.getStatus().state).toBe('disabled');
    expect(await scheduler.getConfig()).toBeNull();
    scheduler.stop();
  });

  it('tests a connection without writing', async () => {
    const { scheduler, client } = setup();
    expect(await scheduler.testConnection(creds)).toEqual({ ok: true });
    client.get.mockResolvedValueOnce('{"format":9}');
    expect(await scheduler.testConnection(creds)).toEqual({ ok: false, reason: 'vaultTooNew' });
    client.checkAccess.mockRejectedValueOnce(new SyncError('auth'));
    expect(await scheduler.testConnection(creds)).toEqual({ ok: false, reason: 'auth' });
    client.get.mockResolvedValueOnce('not json');
    expect(await scheduler.testConnection(creds)).toEqual({ ok: false, reason: 'malformed' });
  });
});
