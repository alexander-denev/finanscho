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
});
