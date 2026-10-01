import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { DeviceSettings } from '../../../../src/ui/features/settings/DeviceSettings.jsx';
import { SyncStore } from '../../../../src/state/SyncStore.js';
import { createFakeSyncControl } from '../../../helpers/testStores.js';
import { createUiStores, renderWithStores } from '../../../helpers/renderWithStores.jsx';

const DAY = 86_400_000;

/**
 * UI stores with sync configured and a controllable device list. The test clock is
 * 2024-05-15T10:00:00Z.
 */
async function setup() {
  const ui = await createUiStores({ path: '/settings' });
  const control = createFakeSyncControl();
  const sync = new SyncStore({ syncControl: control });
  await sync.configure({ url: 'https://dav.test', vaultPath: 'v', username: 'u', password: 'p' });
  const now = ui.clock.nowMs();
  const ago = (/** @type {number} */ ms) => new Date(now - ms).toISOString();
  control.setDevices([
    { deviceId: 'me', deviceName: 'Laptop', lastSeenAt: ago(0), fullySynced: true, isSelf: true },
    {
      deviceId: 'phone',
      deviceName: 'Phone',
      lastSeenAt: ago(2 * DAY),
      fullySynced: false,
      isSelf: false,
    },
    {
      deviceId: 'tablet',
      deviceName: '',
      lastSeenAt: ago(120 * DAY),
      fullySynced: true,
      isSelf: false,
    },
  ]);
  const stores = { ...ui.stores, sync };
  renderWithStores(<DeviceSettings />, stores);
  return { ui, control, stores };
}

describe('DeviceSettings', () => {
  it('is hidden while sync is off', async () => {
    const ui = await createUiStores({ path: '/settings' });
    renderWithStores(<DeviceSettings />, ui.stores);
    expect(screen.queryByRole('heading', { name: 'Devices' })).toBeNull();
  });

  it('lists devices with last-seen times, marking this device, inactive, and lagging ones', async () => {
    await setup();
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(within(items[0]).getByText('This device')).toBeTruthy();
    expect(within(items[0]).queryByRole('button')).toBeNull();
    expect(within(items[1]).getByText('Last synced 2 days ago')).toBeTruthy();
    expect(within(items[1]).getByText(/haven’t reached this device yet/)).toBeTruthy();
    expect(within(items[2]).getByText('Unnamed device')).toBeTruthy();
    expect(within(items[2]).getByText('Inactive')).toBeTruthy();
  });

  it('confirms before removing, warns about recently used devices, and reports the result', async () => {
    const { control, stores } = await setup();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Phone' }));
    const dialog = await screen.findByRole('dialog', { name: 'Remove Phone?' });
    expect(within(dialog).getByText(/synced in the last 7 days/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(control.calls).not.toContain('remove:phone');

    fireEvent.click(screen.getByRole('button', { name: 'Remove Unnamed device' }));
    const second = await screen.findByRole('dialog', { name: 'Remove Unnamed device?' });
    expect(within(second).queryByText(/synced in the last 7 days/)).toBeNull();
    fireEvent.click(within(second).getByRole('button', { name: 'Remove device' }));
    await waitFor(() => expect(control.calls).toContain('remove:tablet'));
    await waitFor(() =>
      expect(stores.toasts.toasts.value.map((t) => t.key)).toContain('toast.deviceRemoved'),
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('explains a refused removal in words', async () => {
    const { control } = await setup();
    control.refuseRemovals(true);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Phone' }));
    const dialog = await screen.findByRole('dialog', { name: 'Remove Phone?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove device' }));
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Not every change from that device has reached this one yet',
    );
  });

  it('cleans up server data and explains a blocked cleanup', async () => {
    const { control, stores } = await setup();
    control.emit({ state: 'idle' });
    fireEvent.click(screen.getByRole('button', { name: 'Clean up server data' }));
    await waitFor(() => expect(control.calls).toContain('compactNow'));
    await waitFor(() =>
      expect(stores.toasts.toasts.value.map((t) => t.key)).toContain('toast.cleanedUp'),
    );
    control.emit({ cleanupBlocked: true });
    expect((await screen.findByRole('alert')).textContent).toContain('add DELETE');
  });
});
