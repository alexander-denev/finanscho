import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { TransactionsPage } from '../../../../src/ui/features/transactions/TransactionsPage.jsx';
import { createUiStores, renderWithStores } from '../../../helpers/renderWithStores.jsx';

/**
 * @param {(ui: Awaited<ReturnType<typeof createUiStores>>, accountId: string) => Promise<void>} [seed]
 *   writes data before the page renders, so a big seed doesn't re-render it once per record
 */
async function setup(seed) {
  const ui = await createUiStores({ path: '/transactions' });
  const account = await ui.stores.accounts.create({
    name: 'Main',
    type: 'checking',
    currency: 'EUR',
    openingBalance: '100',
  });
  if (seed) await seed(ui, account.id);
  await ui.settled();
  renderWithStores(<TransactionsPage />, ui.stores);
  return { ...ui, account };
}

/**
 * @param {Awaited<ReturnType<typeof setup>>} ui
 * @param {string} name
 */
const balanceOf = (ui, name) =>
  ui.stores.accounts.items.value.find((item) => item.account.name === name)?.balanceMinor;

describe('TransactionsPage', () => {
  it('adds a transaction: amount first, then category; it is listed and the balance changes', async () => {
    const ui = await setup();
    expect(screen.getByRole('heading', { name: 'No transactions yet' })).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Add transaction' })[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Add transaction' });
    const amount = await within(dialog).findByLabelText('Amount');
    expect(amount.getAttribute('inputmode')).toBe('decimal');
    expect(document.activeElement).toBe(amount);
    expect(/** @type {HTMLSelectElement} */ (within(dialog).getByLabelText('Account')).value).toBe(
      ui.account.id,
    );
    expect(/** @type {HTMLInputElement} */ (within(dialog).getByLabelText('Date')).value).toBe(
      '2024-05-15',
    );

    fireEvent.input(amount, { target: { value: '12,50' } });
    fireEvent.change(within(dialog).getByLabelText('Category (optional)'), {
      target: { value: 'seed:groceries' },
    });
    fireEvent.input(within(dialog).getByLabelText('Payee (optional)'), {
      target: { value: 'Corner shop' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save transaction' }));

    const row = await screen.findByRole('button', { name: /Corner shop/ });
    expect(row.textContent).toContain('-€12.50');
    await ui.settled();
    expect(balanceOf(ui, 'Main')).toBe(10_000 - 1_250);
    expect(ui.stores.toasts.toasts.value.map((t) => t.key)).toContain('toast.transactionSaved');
  });

  it('shows validation errors inline, linked to the field', async () => {
    await setup();
    fireEvent.click(screen.getAllByRole('button', { name: 'Add transaction' })[0]);
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByLabelText('Amount');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save transaction' }));
    const amount = await within(dialog).findByLabelText('Amount');
    await waitFor(() => expect(amount.getAttribute('aria-invalid')).toBe('true'));
    const errorId = amount.getAttribute('aria-describedby') ?? '';
    expect(document.getElementById(errorId)?.textContent).toBe('Enter an amount.');
    // The category is optional, so it never blocks saving.
    expect(within(dialog).queryByText('This field is required.')).toBeNull();
  });

  it('edits and deletes a transaction', async () => {
    const ui = await setup();
    await ui.stores.transactions.save({
      kind: 'expense',
      date: '2024-05-10',
      amount: '5',
      accountId: ui.account.id,
      categoryId: 'seed:dining',
      payee: 'Cafe',
    });
    await ui.settled();
    fireEvent.click(await screen.findByRole('button', { name: /Cafe/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit transaction' });
    const amount = await within(dialog).findByLabelText('Amount');
    expect(/** @type {HTMLInputElement} */ (amount).value).toBe('5.00');
    fireEvent.input(amount, { target: { value: '7' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save transaction' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Cafe/ }).textContent).toContain('-€7.00'),
    );

    fireEvent.click(screen.getByRole('button', { name: /Cafe/ }));
    const edit = await screen.findByRole('dialog', { name: 'Edit transaction' });
    fireEvent.click(await within(edit).findByRole('button', { name: 'Delete' }));
    const confirm = await screen.findByRole('dialog', { name: 'Delete transaction' });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Delete transaction' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: /Cafe/ })).toBeNull());
    await ui.settled();
    expect(balanceOf(ui, 'Main')).toBe(10_000);
  });

  it('suggests earlier payees and fills the category and account of their last use', async () => {
    const ui = await setup();
    const card = await ui.stores.accounts.create({
      name: 'Card',
      type: 'creditCard',
      currency: 'EUR',
      openingBalance: '0',
    });
    await ui.stores.transactions.save({
      kind: 'expense',
      date: '2024-05-10',
      amount: '20',
      accountId: card.id,
      categoryId: 'seed:groceries',
      payee: 'Lidl',
    });
    await ui.stores.transactions.save({
      kind: 'expense',
      date: '2024-05-11',
      amount: '1',
      accountId: ui.account.id,
    });
    await ui.settled();
    fireEvent.click(screen.getAllByRole('button', { name: 'Add transaction' })[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Add transaction' });
    const payee = /** @type {HTMLInputElement} */ (
      await within(dialog).findByLabelText('Payee (optional)')
    );
    // The payee comes before the category and account it can fill.
    const category = within(dialog).getByLabelText('Category (optional)');
    expect(payee.compareDocumentPosition(category) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.input(payee, { target: { value: 'li' } });
    const option = await within(dialog).findByRole('option', { name: 'Lidl, Groceries' });
    fireEvent.mouseDown(option);
    expect(payee.value).toBe('Lidl');
    expect(/** @type {HTMLSelectElement} */ (category).value).toBe('seed:groceries');
    expect(/** @type {HTMLSelectElement} */ (within(dialog).getByLabelText('Account')).value).toBe(
      card.id,
    );
  });

  it('saves without a category and filters uncategorized transactions', async () => {
    const ui = await setup();
    await ui.stores.transactions.save({
      kind: 'expense',
      date: '2024-05-10',
      amount: '7',
      accountId: ui.account.id,
      categoryId: 'seed:groceries',
      payee: 'Market',
    });
    await ui.settled();
    fireEvent.click(screen.getAllByRole('button', { name: 'Add transaction' })[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Add transaction' });
    fireEvent.input(await within(dialog).findByLabelText('Amount'), { target: { value: '3' } });
    fireEvent.input(within(dialog).getByLabelText('Payee (optional)'), {
      target: { value: 'Kiosk' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save transaction' }));
    const row = await screen.findByRole('button', { name: /Kiosk/ });
    expect(row.textContent).toContain('Uncategorized');

    fireEvent.change(screen.getByLabelText('Category'), { target: { value: ':uncategorized' } });
    await waitFor(() => expect(screen.queryByRole('button', { name: /Market/ })).toBeNull());
    expect(screen.getByRole('button', { name: /Kiosk/ })).toBeTruthy();
  });

  it('filters by category and pages long lists', async () => {
    await setup(async (ui, accountId) => {
      for (let i = 1; i <= 55; i += 1) {
        await ui.services.transactions.create({
          kind: 'expense',
          date: `2024-04-${String((i % 28) + 1).padStart(2, '0')}`,
          amount: String(i),
          accountId,
          categoryId: i === 3 ? 'seed:travel' : 'seed:groceries',
        });
      }
    });
    await screen.findByRole('button', { name: 'Load more' });
    expect(screen.getAllByRole('listitem')).toHaveLength(50);
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(55));
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'seed:travel' } });
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(50));
  });

  it('says which automation made a transaction and links to it', async () => {
    const ui = await setup(async (u, accountId) => {
      await u.stores.automations.create({
        name: 'Rent',
        startDate: '2024-05-01',
        triggers: [
          { type: 'schedule', frequency: 'monthly', interval: 1, firstDate: '2024-05-01' },
        ],
        actions: [
          {
            type: 'createTransaction',
            template: { kind: 'expense', accountId, payee: 'Landlord' },
            amount: { type: 'fixed', value: '800' },
          },
        ],
      });
    });
    const row = await screen.findByRole('button', { name: /Landlord/ });
    expect(row.textContent).toContain('Automatic');
    fireEvent.click(row);
    const dialog = await screen.findByRole('dialog', { name: 'Edit transaction' });
    expect(within(dialog).getByText(/Made by the automation “Rent”/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText(/the automation won’t make it again/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    const reopened = await screen.findByRole('dialog', { name: 'Edit transaction' });
    fireEvent.click(within(reopened).getByRole('button', { name: 'Open automation' }));
    expect(ui.stores.router.currentPath.value).toMatch(/^\/automations\/.+/);
  });
});
