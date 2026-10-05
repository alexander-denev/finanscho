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

  it('opens the add dialog on /accounts/new and returns to /accounts when closed', async () => {
    const ui = await createUiStores({ path: '/accounts/new' });
    renderWithStores(<AccountsPage />, ui.stores);
    const dialog = await screen.findByRole('dialog', { name: 'Add account' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(ui.stores.router.currentPath.value).toBe('/accounts');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
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

  it('deletes an unused account and explains why a used one stays', async () => {
    const ui = await createUiStores({ path: '/accounts' });
    const used = await ui.stores.accounts.create({
      name: 'Used',
      type: 'checking',
      currency: 'EUR',
      openingBalance: '0',
    });
    await ui.stores.accounts.create({
      name: 'Mistake',
      type: 'cash',
      currency: 'EUR',
      openingBalance: '0',
    });
    await ui.stores.transactions.save({
      kind: 'expense',
      date: '2024-05-10',
      amount: '1',
      accountId: used.id,
    });
    await ui.settled();
    renderWithStores(<AccountsPage />, ui.stores);

    fireEvent.click(await screen.findByRole('button', { name: /Used/ }));
    let dialog = await screen.findByRole('dialog', { name: 'Edit account' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(
      await within(dialog).findByText(
        'This account has transactions or automations that use it, so it can’t be deleted. Archive it instead.',
      ),
    ).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    fireEvent.click(await screen.findByRole('button', { name: /Mistake/ }));
    dialog = await screen.findByRole('dialog', { name: 'Edit account' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    const confirm = await screen.findByRole('dialog', { name: 'Delete account' });
    expect(within(confirm).getByText('Delete Mistake? This can’t be undone.')).toBeTruthy();
    fireEvent.click(within(confirm).getByRole('button', { name: 'Delete account' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: /Mistake/ })).toBeNull());
    expect(ui.stores.toasts.toasts.value.map((t) => t.key)).toContain('toast.accountDeleted');
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
    fireEvent.click(await screen.findByRole('radio', { name: 'Archived (1)' }));
    const archived = await screen.findByRole('list', { name: 'Archived accounts' });
    expect(within(archived).getByRole('button', { name: /Old bank/ })).toBeTruthy();
    fireEvent.click(within(archived).getByRole('button', { name: /Old bank/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Restore' }));
    await waitFor(() =>
      expect(screen.queryByRole('list', { name: 'Archived accounts' })).toBeNull(),
    );
    // With nothing archived, the tabs disappear and the active list is back.
    expect(screen.queryByRole('radio', { name: /Archived/ })).toBeNull();
    expect(within(screen.getByRole('list', { name: 'Accounts' })).getByRole('button')).toBeTruthy();
  });

  it('reconciles an account with the counted balance', async () => {
    const ui = await createUiStores({ path: '/accounts' });
    const main = await ui.stores.accounts.create({
      name: 'Main',
      type: 'checking',
      currency: 'EUR',
      openingBalance: '100',
    });
    await ui.stores.transactions.save({
      kind: 'expense',
      date: '2024-05-10',
      amount: '20',
      accountId: main.id,
    });
    await ui.settled();
    renderWithStores(<AccountsPage />, ui.stores);

    fireEvent.click(await screen.findByRole('button', { name: /Main/ }));
    let dialog = await screen.findByRole('dialog', { name: 'Edit account' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reconcile balance' }));
    dialog = await screen.findByRole('dialog', { name: 'Reconcile balance' });
    expect(dialog.textContent).toContain('€80.00');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Reconcile' }));
    expect(await within(dialog).findByText('Enter an amount.')).toBeTruthy();

    fireEvent.input(within(dialog).getByLabelText('Actual balance'), {
      target: { value: '75' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reconcile' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(ui.stores.toasts.toasts.value.at(-1)).toMatchObject({
      key: 'toast.reconciled',
      params: { amount: '-€5.00' },
    });
    const list = screen.getByRole('list', { name: 'Accounts' });
    await waitFor(() =>
      expect(within(list).getByRole('button', { name: /Main/ }).textContent).toContain('€75.00'),
    );
  });
});
