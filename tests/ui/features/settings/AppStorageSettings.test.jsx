import { describe, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/preact';
import { AppStorageSettings } from '../../../../src/ui/features/settings/AppStorageSettings.jsx';
import { FakeInstallEnvironment } from '../../../helpers/FakeInstallEnvironment.js';
import { createUiStores, renderWithStores } from '../../../helpers/renderWithStores.jsx';

/** @param {string} term */
function factValue(term) {
  const dt = screen.getByText(term, { selector: 'dt' });
  return dt.nextElementSibling?.textContent;
}

describe('AppStorageSettings', () => {
  it('shows install and storage status with space used, and protects data on request', async () => {
    const env = new FakeInstallEnvironment({ browser: 'firefox' });
    const ui = await createUiStores({ installEnvironment: env });
    renderWithStores(<AppStorageSettings />, ui.stores);
    expect(factValue('App')).toBe('Running in the browser');
    expect(factValue('Storage')).toBe('Not guaranteed');
    expect(factValue('Space used')).toBe('2.5 MB of 1 GB available');
    expect(screen.getByText(/can clear Finanscho’s storage/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Protect my data' }));
    expect(await screen.findByText('Protected')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Protect my data' })).toBeNull();
    expect(screen.getByText(/a backup is still a good idea/)).toBeTruthy();
  });

  it('explains when the browser refuses to protect storage', async () => {
    const env = new FakeInstallEnvironment({ browser: 'firefox' });
    env.persistGrant = false;
    const ui = await createUiStores({ installEnvironment: env });
    renderWithStores(<AppStorageSettings />, ui.stores);
    fireEvent.click(screen.getByRole('button', { name: 'Protect my data' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('Installing the app usually helps');
  });

  it('opens install instructions from Settings', async () => {
    const ui = await createUiStores({
      installEnvironment: new FakeInstallEnvironment({ os: 'desktop', browser: 'chromium' }),
    });
    renderWithStores(<AppStorageSettings />, ui.stores);
    fireEvent.click(screen.getByRole('button', { name: 'How to install' }));
    expect(await screen.findByRole('dialog', { name: 'Install Finanscho' })).toBeTruthy();
    expect(screen.getByText('Your data carries over to the installed app.')).toBeTruthy();
  });

  it('points a fresh iOS home-screen app to import and sync, without install actions', async () => {
    const env = new FakeInstallEnvironment({ os: 'ios', browser: 'safari' });
    env.standalone = true;
    env.persistedValue = true;
    const ui = await createUiStores({ installEnvironment: env });
    renderWithStores(<AppStorageSettings />, ui.stores);
    expect(factValue('App')).toBe('Installed');
    expect(screen.getByText('Bring your data to this app')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'How to install' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Protect my data' })).toBeNull();
  });
});
