import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/preact';
import { InstallBanner } from '../../../../src/ui/features/install/InstallBanner.jsx';
import { FakeInstallEnvironment } from '../../../helpers/FakeInstallEnvironment.js';
import { createUiStores, renderWithStores } from '../../../helpers/renderWithStores.jsx';

/** @param {FakeInstallEnvironment} [installEnvironment] */
async function setup(installEnvironment) {
  const ui = await createUiStores({ installEnvironment });
  await ui.stores.accounts.create({
    name: 'Main',
    type: 'cash',
    currency: 'EUR',
    openingBalance: '1',
  });
  await ui.settled();
  renderWithStores(<InstallBanner />, ui.stores);
  return ui;
}

describe('InstallBanner', () => {
  it('stays hidden until there is real data', async () => {
    const ui = await createUiStores();
    renderWithStores(<InstallBanner />, ui.stores);
    expect(screen.queryByText('Install Finanscho on this device')).toBeNull();
  });

  it('opens the instructions when the browser has no prompt, and snoozes on "Not now"', async () => {
    const ui = await setup(new FakeInstallEnvironment({ os: 'ios', browser: 'safari' }));
    expect(screen.getByText('Install Finanscho on this device')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'How to install' }));
    expect(await screen.findByRole('dialog', { name: 'Install Finanscho' })).toBeTruthy();
    expect(screen.getByText('Your data stays here in Safari')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    await waitFor(() => expect(screen.queryByText('Install Finanscho on this device')).toBeNull());
    expect((await ui.services.settings.loadInstallNotice()).dismissCount).toBe(1);
  });

  it('uses the browser prompt and confirms the install', async () => {
    const env = new FakeInstallEnvironment({ os: 'android', browser: 'chromium' });
    env.promptAvailable = true;
    const ui = await setup(env);
    fireEvent.click(screen.getByRole('button', { name: 'Install' }));
    await waitFor(() =>
      expect(ui.stores.toasts.toasts.value.map((t) => t.key)).toContain('toast.installed'),
    );
    expect(env.calls).toContain('persist');
    env.setStandalone(true);
    await waitFor(() => expect(screen.queryByText('Install Finanscho on this device')).toBeNull());
  });
});
