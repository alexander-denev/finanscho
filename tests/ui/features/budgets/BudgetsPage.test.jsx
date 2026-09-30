import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { BudgetsPage } from '../../../../src/ui/features/budgets/BudgetsPage.jsx';
import { createUiStores, renderWithStores } from '../../../helpers/renderWithStores.jsx';

describe('BudgetsPage', () => {
  it('sets a budget and shows spent, remaining, and progress', async () => {
    const ui = await createUiStores({ path: '/budgets' });
    const account = await ui.stores.accounts.create({
      name: 'Main',
      type: 'checking',
      currency: 'EUR',
      openingBalance: '0',
    });
    await ui.stores.transactions.save({
      kind: 'expense',
      date: '2024-05-04',
      amount: '45',
      accountId: account.id,
      categoryId: 'seed:groceries',
    });
    await ui.settled();
    renderWithStores(<BudgetsPage />, ui.stores);
    expect(screen.getByText('May 2024')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'No budgets for this month' })).toBeTruthy();

    fireEvent.click(screen.getAllByRole('button', { name: 'Set a budget' })[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Set a budget' });
    fireEvent.change(within(dialog).getByLabelText('Category'), {
      target: { value: 'seed:groceries' },
    });
    fireEvent.input(within(dialog).getByLabelText('Monthly limit'), { target: { value: '50' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save budget' }));

    const bar = await screen.findByRole('progressbar', { name: 'Groceries: 90% of budget spent' });
    expect(bar.getAttribute('aria-valuenow')).toBe('90');
    expect(screen.getByText('€5.00 left')).toBeTruthy();
    expect(screen.getAllByText('Close to the limit').length).toBeGreaterThan(0);
  });

  it("copies last month's budgets into the next month", async () => {
    const ui = await createUiStores({ path: '/budgets' });
    await ui.stores.budgets.setBudget('seed:dining', '80');
    await ui.settled();
    renderWithStores(<BudgetsPage />, ui.stores);
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    await screen.findByText('June 2024');
    await screen.findByRole('heading', { name: 'No budgets for this month' });
    fireEvent.click(screen.getByRole('button', { name: 'Copy last month’s budgets' }));
    expect(
      await screen.findByRole('progressbar', { name: 'Eating out: 0% of budget spent' }),
    ).toBeTruthy();
    await waitFor(() =>
      expect(ui.stores.toasts.toasts.value.map((t) => t.key)).toContain('toast.budgetsCopied'),
    );
  });
});
