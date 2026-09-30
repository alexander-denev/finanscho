import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { RecurringPage } from '../../../../src/ui/features/recurring/RecurringPage.jsx';
import { createUiStores, renderWithStores } from '../../../helpers/renderWithStores.jsx';

async function setup() {
  const ui = await createUiStores({ path: '/recurring' });
  await ui.stores.accounts.create({
    name: 'Main',
    type: 'checking',
    currency: 'EUR',
    openingBalance: '0',
  });
  await ui.settled();
  renderWithStores(<RecurringPage />, ui.stores);
  return ui;
}

describe('RecurringPage', () => {
  it('adds a monthly rule, materializes due occurrences, and lists upcoming ones', async () => {
    const ui = await setup();
    fireEvent.click(screen.getAllByRole('button', { name: 'Add recurring transaction' })[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Add recurring transaction' });
    fireEvent.input(within(dialog).getByLabelText('Amount'), { target: { value: '900' } });
    fireEvent.change(within(dialog).getByLabelText('Category'), {
      target: { value: 'seed:housing' },
    });
    fireEvent.input(within(dialog).getByLabelText('Payee (optional)'), {
      target: { value: 'Rent' },
    });
    fireEvent.input(within(dialog).getByLabelText('Start date'), {
      target: { value: '2024-04-01' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save recurring transaction' }));

    const row = await screen.findByRole('button', { name: /Rent/ });
    expect(row.textContent).toContain('Monthly');
    expect(row.textContent).toContain('Next: Jun 1, 2024');
    const upcoming = screen.getByRole('heading', { name: 'Next 30 days' }).closest('section');
    expect(within(/** @type {HTMLElement} */ (upcoming)).getByText('Rent')).toBeTruthy();
    await ui.settled();
    const { items } = await ui.services.transactions.query({ limit: 10 });
    expect(items.map((tx) => tx.date)).toEqual(['2024-05-01', '2024-04-01']);
  });

  it('explains that editing starts a new rule, and can stop a rule', async () => {
    const ui = await setup();
    const account = ui.stores.accounts.items.value[0].account;
    await ui.stores.recurring.create({
      frequency: 'weekly',
      interval: 2,
      startDate: '2024-05-13',
      endDate: null,
      template: {
        kind: 'income',
        amount: '100',
        accountId: account.id,
        categoryId: 'seed:salary',
        payee: 'Tutoring',
      },
    });
    await ui.settled();
    fireEvent.click(await screen.findByRole('button', { name: /Tutoring/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Change recurring transaction' });
    expect(
      within(dialog).getByText(
        'Changes apply from the start date you choose. Earlier transactions stay as they are.',
      ),
    ).toBeTruthy();
    expect(
      /** @type {HTMLInputElement} */ (within(dialog).getByLabelText('Start date')).value,
    ).toBe('2024-05-27');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Stop' }));
    const confirm = await screen.findByRole('dialog', { name: 'Stop' });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Stop' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Tutoring/ }).textContent).toContain('Ended'),
    );
  });
});
