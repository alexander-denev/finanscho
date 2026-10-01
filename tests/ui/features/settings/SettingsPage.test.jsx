import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { SettingsPage } from '../../../../src/ui/features/settings/SettingsPage.jsx';
import { createUiStores, renderWithStores } from '../../../helpers/renderWithStores.jsx';

describe('SettingsPage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('changes the theme and saves general settings', async () => {
    const ui = await createUiStores({ path: '/settings' });
    renderWithStores(<SettingsPage />, ui.stores);
    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));
    await waitFor(() => expect(ui.stores.settings.values.value.theme).toBe('dark'));
    fireEvent.input(screen.getByLabelText('Device name'), { target: { value: 'Work laptop' } });
    fireEvent.input(screen.getByLabelText('Default currency'), { target: { value: 'chf' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    await waitFor(() => expect(ui.stores.settings.values.value.deviceName).toBe('Work laptop'));
    expect(ui.stores.settings.values.value.defaultCurrency).toBe('CHF');
  });

  it('starts with app and storage status and explains CORS for sync', async () => {
    const ui = await createUiStores({ path: '/settings' });
    renderWithStores(<SettingsPage />, ui.stores);
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings[0]).toBe('App and storage');
    expect(screen.getByRole('button', { name: 'Protect my data' })).toBeTruthy();
    expect(screen.getByText(/must allow cross-origin requests \(CORS\)/)).toBeTruthy();
  });

  it('tests the connection and saves sync settings', async () => {
    const ui = await createUiStores({ path: '/settings' });
    renderWithStores(<SettingsPage />, ui.stores);
    const section = /** @type {HTMLElement} */ (
      screen.getByRole('heading', { name: 'Sync' }).closest('section')
    );
    fireEvent.input(within(section).getByLabelText('Server URL'), {
      target: { value: 'https://dav.example.com/dav' },
    });
    fireEvent.input(within(section).getByLabelText('Username'), { target: { value: 'me' } });
    fireEvent.input(within(section).getByLabelText('Password'), { target: { value: 'wrong' } });
    fireEvent.click(within(section).getByRole('button', { name: 'Test connection' }));
    expect(
      await within(section).findByText(
        'The server rejected the username or password. Check them in Settings.',
      ),
    ).toBeTruthy();
    fireEvent.input(within(section).getByLabelText('Password'), { target: { value: 'right' } });
    fireEvent.click(within(section).getByRole('button', { name: 'Test connection' }));
    expect(
      await within(section).findByText('Connection works. Save to start syncing.'),
    ).toBeTruthy();
    fireEvent.click(within(section).getByRole('button', { name: 'Save and sync' }));
    expect(await within(section).findByRole('button', { name: 'Sync now' })).toBeTruthy();
    expect(ui.stores.sync.config.value).toMatchObject({
      url: 'https://dav.example.com/dav',
      vaultPath: 'finanscho',
      username: 'me',
    });
    fireEvent.click(within(section).getByRole('button', { name: 'Turn off sync' }));
    await waitFor(() => expect(ui.stores.sync.config.value).toBeNull());
  });

  it('exports a backup file and imports one', async () => {
    const ui = await createUiStores({ path: '/settings' });
    await ui.stores.accounts.create({
      name: 'Main',
      type: 'cash',
      currency: 'EUR',
      openingBalance: '1',
    });
    const createObjectURL = vi.fn(() => 'blob:backup');
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    renderWithStores(<SettingsPage />, ui.stores);
    fireEvent.click(screen.getByRole('button', { name: 'Export backup' }));
    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(createObjectURL).toHaveBeenCalled();
    const backup = await ui.stores.settings.exportBackup();

    const other = await createUiStores({ deviceId: '55555555-5555-4555-8555-555555555555' });
    renderWithStores(<SettingsPage />, other.stores);
    const inputs = screen.getAllByLabelText('Backup file');
    const input = /** @type {HTMLInputElement} */ (inputs[inputs.length - 1]);
    const file = new File([backup.json], 'backup.json', { type: 'application/json' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    fireEvent.change(input);
    await waitFor(() =>
      expect(other.stores.toasts.toasts.value.map((t) => t.key)).toContain('toast.imported'),
    );
    await other.settled();
    expect(other.stores.accounts.items.value.map((a) => a.account.name)).toEqual(['Main']);
  });

  it('reports an invalid backup file in words', async () => {
    const ui = await createUiStores({ path: '/settings' });
    renderWithStores(<SettingsPage />, ui.stores);
    const input = /** @type {HTMLInputElement} */ (screen.getByLabelText('Backup file'));
    Object.defineProperty(input, 'files', {
      value: [new File(['nope'], 'x.json')],
      configurable: true,
    });
    fireEvent.change(input);
    expect(
      await screen.findByText(
        'That file isn’t a Finanscho backup. Choose a file exported from Finanscho.',
      ),
    ).toBeTruthy();
  });
});
