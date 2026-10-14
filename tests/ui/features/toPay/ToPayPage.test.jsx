import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { ToPayPage } from '../../../../src/ui/features/toPay/ToPayPage.jsx';
import { createUiStores, renderWithStores } from '../../../helpers/renderWithStores.jsx';
import { chooseOption } from '../../../helpers/chooseOption.js';

/** @typedef {import('../../../../src/core/domain/toPay.js').ToPayInput} ToPayInput */

/**
 * @param {{ path?: string, seed?: (ui: Awaited<ReturnType<typeof createUiStores>>, accountId: string) => Promise<void> }} [options]
 */
async function setup(options = {}) {
  const ui = await createUiStores({ path: options.path ?? '/to-pay' });
  const account = await ui.stores.accounts.create({
    name: 'Main',
    type: 'checking',
    currency: 'EUR',
    openingBalance: '1000',
  });
  if (options.seed) await options.seed(ui, account.id);
  await ui.settled();
  renderWithStores(<ToPayPage />, ui.stores);
  return { ...ui, account };
}

/**
 * @param {string} accountId
 * @param {Partial<ToPayInput>} [over]
 * @returns {ToPayInput}
 */
const rent = (accountId, over = {}) => ({
  kind: 'expense',
  amount: '800',
  accountId,
  categoryId: 'seed:housing',
  payee: 'Landlord',
  dueDate: '2024-05-15',
  ...over,
});

/**
 * @param {Awaited<ReturnType<typeof setup>>} ui
 * @returns {number | undefined}
 */
const balance = (ui) => ui.stores.accounts.items.value[0]?.balanceMinor;

describe('ToPayPage', () => {
  it('adds a To pay with a due date; it is listed with the days left', async () => {
    const ui = await setup();
    expect(screen.getByRole('heading', { name: 'Nothing to pay' })).toBeTruthy();
    fireEvent.click(screen.getAllByRole('link', { name: 'Add To pay' })[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Add To pay' });
    fireEvent.input(await within(dialog).findByLabelText('Amount'), { target: { value: '45' } });
    chooseOption(
      within(dialog).getByRole('combobox', { name: 'Category (optional)' }),
      'Utilities',
    );
    fireEvent.input(within(dialog).getByLabelText('Payee (optional)'), {
      target: { value: 'Power company' },
    });
    fireEvent.input(within(dialog).getByLabelText('Due date (optional)'), {
      target: { value: '2024-05-20' },
    });
    expect(within(dialog).queryByRole('button', { name: 'Pay' })).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save To pay' }));

    const row = await screen.findByRole('button', { name: /^Power company/ });
    expect(row.textContent).toContain('5 days left');
    expect(row.textContent).toContain('-€45.00');
    expect(ui.stores.toasts.toasts.value.map((toast) => toast.key)).toContain('toast.toPaySaved');
    // Adding a To pay records nothing.
    expect(balance(ui)).toBe(100_000);
  });

  it('edits only the To pay', async () => {
    const ui = await setup({ seed: (s, id) => s.stores.toPays.create(rent(id)).then(() => {}) });
    fireEvent.click(await screen.findByRole('button', { name: /^Landlord/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit To pay' });
    const amount = await within(dialog).findByLabelText('Amount');
    fireEvent.input(amount, { target: { value: '850' } });
    fireEvent.input(within(dialog).getByLabelText('Due date (optional)'), {
      target: { value: '' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save To pay' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await ui.settled();
    const row = await screen.findByRole('button', { name: /^Landlord/ });
    expect(row.textContent).toContain('-€850.00');
    expect(row.textContent).not.toContain('Due');
    expect(ui.stores.transactions.days.value).toEqual([]);
    expect(balance(ui)).toBe(100_000);
  });

  it('pays from the row: records the transaction dated today and removes the To pay', async () => {
    const ui = await setup({ seed: (s, id) => s.stores.toPays.create(rent(id)).then(() => {}) });
    const row = await screen.findByRole('button', { name: /^Landlord/ });
    expect(within(row).getByText(/Due today/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Pay Landlord' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: /^Landlord/ })).toBeNull());
    await ui.settled();
    expect(balance(ui)).toBe(100_000 - 80_000);
    const [day] = ui.stores.transactions.days.value;
    expect(day.date).toBe('2024-05-15');
    expect(day.items[0]).toMatchObject({ payee: 'Landlord', categoryId: 'seed:housing' });
    expect(ui.stores.toasts.toasts.value.map((toast) => toast.params)).toContainEqual({
      payee: 'Landlord',
      amount: '€800.00',
      account: 'Main',
    });
  });

  it('pays from the dialog what the form shows', async () => {
    const ui = await setup({ seed: (s, id) => s.stores.toPays.create(rent(id)).then(() => {}) });
    fireEvent.click(await screen.findByRole('button', { name: /^Landlord/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit To pay' });
    fireEvent.input(await within(dialog).findByLabelText('Amount'), { target: { value: '810' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Pay' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await ui.settled();
    expect(ui.stores.toPays.items.value).toEqual([]);
    expect(balance(ui)).toBe(100_000 - 81_000);
  });

  it('deletes after asking, without recording anything', async () => {
    const ui = await setup({ seed: (s, id) => s.stores.toPays.create(rent(id)).then(() => {}) });
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Landlord' }));
    const confirm = await screen.findByRole('dialog', { name: 'Delete To pay' });
    expect(confirm.textContent).toContain('Nothing is recorded.');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Delete To pay' }));
    await screen.findByRole('heading', { name: 'Nothing to pay' });
    await ui.settled();
    expect(balance(ui)).toBe(100_000);
  });

  it('opens a To pay by its link and shows the automation that made it', async () => {
    /** @type {string} */
    let toPayId = '';
    /** @type {string} */
    let automationId = '';
    const ui = await setup({
      path: '/to-pay/placeholder',
      seed: async (s, accountId) => {
        const automation = await s.stores.automations.create({
          name: 'Monthly rent',
          startDate: '2024-06-01',
          triggers: [
            { type: 'schedule', every: 1, unit: 'month', monthDay: { kind: 'day', day: 1 } },
          ],
          actions: [
            {
              type: 'createTransaction',
              template: { kind: 'expense', accountId },
              amount: { type: 'fixed', value: '1' },
            },
          ],
        });
        automationId = automation.id;
        const made = await s.stores.toPays.create(rent(accountId));
        await s.repos.toPays.update(made.id, { automationId });
        toPayId = made.id;
        s.stores.router.navigate(`/to-pay/${encodeURIComponent(toPayId)}`);
      },
    });
    const row = await screen.findByRole('button', { name: /^Landlord/ });
    expect(within(row).getByText('Automatic')).toBeTruthy();
    const dialog = await screen.findByRole('dialog', { name: 'Edit To pay' });
    expect(dialog.textContent).toContain('Made by the automation “Monthly rent”.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Open automation' }));
    expect(ui.stores.router.currentPath.value).toBe(`/automations/${automationId}`);
  });

  it('says when the automation that made a To pay was deleted', async () => {
    await setup({
      seed: async (s, accountId) => {
        const made = await s.stores.toPays.create(rent(accountId));
        await s.repos.toPays.update(made.id, { automationId: 'gone' });
      },
    });
    fireEvent.click(await screen.findByRole('button', { name: /^Landlord/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit To pay' });
    await within(dialog).findByLabelText('Amount');
    expect(dialog.textContent).toContain('Made by an automation that was deleted.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    const confirm = await screen.findByRole('dialog', { name: 'Delete To pay' });
    expect(confirm.textContent).toContain('the automation won’t make it again');
  });
});
