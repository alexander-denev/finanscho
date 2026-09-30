import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { App } from '../../../src/app/App.jsx';
import { createUiStores } from '../../helpers/renderWithStores.jsx';

describe('App', () => {
  it('routes by hash and adds a transaction from anywhere, updating the dashboard', async () => {
    const ui = await createUiStores({ path: '/' });
    await ui.stores.accounts.create({
      name: 'Main',
      type: 'checking',
      currency: 'EUR',
      openingBalance: '100',
    });
    await ui.settled();
    render(<App stores={ui.stores} />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeTruthy();

    fireEvent.click(screen.getAllByRole('button', { name: 'Add transaction' })[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Add transaction' });
    fireEvent.input(await within(dialog).findByLabelText('Amount'), { target: { value: '30' } });
    fireEvent.change(within(dialog).getByLabelText('Category'), {
      target: { value: 'seed:transport' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save transaction' }));

    const total = await screen.findByRole('heading', { name: 'Total balance' });
    await waitFor(() =>
      expect(/** @type {HTMLElement} */ (total.closest('section')).textContent).toContain('€70.00'),
    );
    expect(await screen.findByText('Transaction saved.')).toBeTruthy();

    ui.stores.router.navigate('/budgets');
    expect(await screen.findByRole('heading', { level: 1, name: 'Budgets' })).toBeTruthy();
    ui.stores.router.navigate('/nowhere');
    expect(await screen.findByRole('heading', { level: 1, name: 'Page not found' })).toBeTruthy();
  });

  it('applies the theme preference to the document', async () => {
    const ui = await createUiStores();
    render(<App stores={ui.stores} />);
    await ui.stores.settings.setTheme('dark');
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));
    await ui.stores.settings.setTheme('system');
    await waitFor(() => expect(document.documentElement.dataset.theme).toBeUndefined());
  });
});
