import { describe, expect, it } from 'vitest';
import { SyncStore } from '../../src/state/SyncStore.js';
import { createFakeSyncControl } from '../helpers/testStores.js';

describe('SyncStore', () => {
  it('mirrors the sync controller and forwards actions', async () => {
    const control = createFakeSyncControl();
    const store = new SyncStore({ syncControl: control });
    expect(store.syncStatus.value.state).toBe('disabled');
    control.emit({ state: 'syncing' });
    expect(store.syncStatus.value.state).toBe('syncing');
    const creds = { url: 'https://d', vaultPath: 'v', username: 'u', password: 'wrong' };
    expect(await store.testConnection(creds)).toEqual({ ok: false, reason: 'auth' });
    await store.configure({ ...creds, password: 'right' });
    expect(store.config.value?.password).toBe('right');
    await store.syncNow();
    await store.configure(null);
    expect(store.config.value).toBeNull();
    expect(control.calls).toEqual(['test', 'configure', 'syncNow', 'clear']);
    store.dispose();
    control.emit({ state: 'idle' });
    expect(store.syncStatus.value.state).toBe('syncing');
  });

  it('mirrors the device list and forwards removal and cleanup', async () => {
    const control = createFakeSyncControl();
    const store = new SyncStore({ syncControl: control });
    expect(store.devices.value).toEqual([]);
    const other = {
      deviceId: 'old',
      deviceName: 'Old phone',
      lastSeenAt: null,
      fullySynced: true,
      isSelf: false,
    };
    control.setDevices([
      { deviceId: 'me', deviceName: 'Me', lastSeenAt: null, fullySynced: true, isSelf: true },
      other,
    ]);
    expect(store.devices.value.map((d) => d.deviceId)).toEqual(['me', 'old']);
    await store.removeDevice('old');
    expect(store.devices.value.map((d) => d.deviceId)).toEqual(['me']);
    await store.compactNow();
    control.refuseRemovals(true);
    await expect(store.removeDevice('me')).rejects.toMatchObject({ reason: 'removeIncomplete' });
    expect(control.calls).toEqual(['remove:old', 'compactNow', 'remove:me']);
  });
});
