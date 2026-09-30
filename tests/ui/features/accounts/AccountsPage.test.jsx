import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { AccountsPage } from '../../../../src/ui/features/accounts/AccountsPage.jsx';
import { createUiStores, renderWithStores } from '../../../helpers/renderWithStores.jsx';

describe('AccountsPage', () => {
  it('adds an account and shows its balance and the total', async () => {
    const ui = await createUiStores({ path: '/accounts' });
    renderWithStores(<AccountsPage />, ui.stores);
    expect(screen.getByRole('heading', { name: 'No accounts yet' })).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Add account' })[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Add account' });
    fireEvent.input(within(dialog).getByLabelText('Name'), { target: { value: 'Visa' } });
    fireEvent.change(within(dialog).getByLabelText('Type'), { target: { value: 'creditCard' } });
    expect(/** @type {HTMLInputElement} */ (within(dialog).getByLabelText('Currency')).value).toBe(
      'EUR',
    );
    fireEvent.input(within(dialog).getByLabelText('Opening balance'), {
      target: { value: '-250' },
    });
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Rose' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save account' }));

    const list = await screen.findByRole('list', { name: 'Accounts' });
    const row = await within(list).findByRole('button', { name: /Visa/ });
    expect(row.textContent).toContain('Credit card');
    expect(row.textContent).toContain('Negative -€250.00');
  });

  it('rejects an invalid opening balance inline', async () => {
    const ui = await createUiStores({ path: '/accounts' });
    renderWithStores(<AccountsPage />, ui.stores);
    fireEvent.click(screen.getAllByRole('button', { name: 'Add account' })[0]);
    const dialog = await screen.findByRole('dialog');
    fireEvent.input(within(dialog).getByLabelText('Name'), { target: { value: 'Cash' } });
    fireEvent.input(within(dialog).getByLabelText('Opening balance'), {
      target: { value: '1.234' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save account' }));
    expect(
      await within(dialog).findByText('This currency doesn’t allow that many decimal places.'),
    ).toBeTruthy();
  });

  it('archives and restores an account', async () => {
    const ui = await createUiStores({ path: '/accounts' });
    await ui.stores.accounts.create({
      name: 'Old bank',
      type: 'checking',
      currency: 'EUR',
      openingBalance: '0',
    });
    await ui.settled();
    renderWithStores(<AccountsPage />, ui.stores);
    fireEvent.click(await screen.findByRole('button', { name: /Old bank/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit account' });
    expect(within(dialog).queryByLabelText('Currency')).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Archive' }));
    const archived = await screen.findByRole('list', { name: 'Archived accounts' });
    expect(within(archived).getByRole('button', { name: /Old bank/ })).toBeTruthy();
    fireEvent.click(within(archived).getByRole('button', { name: /Old bank/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Restore' }));
    await waitFor(() =>
      expect(screen.queryByRole('list', { name: 'Archived accounts' })).toBeNull(),
    );
  });
});
