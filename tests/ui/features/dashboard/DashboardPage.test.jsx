import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/preact';
import { DashboardPage } from '../../../../src/ui/features/dashboard/DashboardPage.jsx';
import { createUiStores, renderWithStores } from '../../../helpers/renderWithStores.jsx';
import { FakeInstallEnvironment } from '../../../helpers/FakeInstallEnvironment.js';

describe('DashboardPage', () => {
  it('tells a new user to add an account', async () => {
    const ui = await createUiStores();
    renderWithStores(<DashboardPage />, ui.stores);
    expect(screen.getByRole('heading', { name: 'Start by adding an account' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Add an account' }).getAttribute('href')).toBe(
      '/accounts/new',
    );
  });

  it('points a fresh iOS home-screen app to import and sync', async () => {
    const env = new FakeInstallEnvironment({ os: 'ios', browser: 'safari' });
    env.standalone = true;
    const ui = await createUiStores({ installEnvironment: env });
    renderWithStores(<DashboardPage />, ui.stores);
    expect(screen.getByText('Bring your data to this app')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open Settings' }).getAttribute('href')).toBe(
      '/settings',
    );
  });

  it('summarizes balances, the month, budgets, and upcoming items', async () => {
    const ui = await createUiStores();
    const main = await ui.stores.accounts.create({
      name: 'Main',
      type: 'checking',
      currency: 'EUR',
      openingBalance: '1000',
    });
    await ui.stores.transactions.save({
      kind: 'income',
      date: '2024-05-01',
      amount: '2000',
      accountId: main.id,
      categoryId: 'seed:salary',
    });
    await ui.stores.transactions.save({
      kind: 'expense',
      date: '2024-05-02',
      amount: '120',
      accountId: main.id,
      categoryId: 'seed:dining',
    });
    await ui.stores.budgets.setBudget('seed:dining', '100');
    await ui.stores.automations.create({
      name: 'Streaming',
      startDate: '2024-05-25',
      triggers: [{ type: 'schedule', every: 1, unit: 'month', monthDay: { kind: 'day', day: 25 } }],
      actions: [
        {
          type: 'createTransaction',
          template: {
            kind: 'expense',
            accountId: main.id,
            categoryId: 'seed:subscriptions',
            payee: 'Streaming',
          },
          amount: { type: 'fixed', value: '12' },
        },
      ],
    });
    await ui.settled();
    renderWithStores(<DashboardPage />, ui.stores);

    const total = /** @type {HTMLElement} */ (
      screen.getByRole('heading', { name: 'Total balance' }).closest('section')
    );
    expect(total.textContent).toContain('€2,880.00');
    const month = /** @type {HTMLElement} */ (
      screen.getByRole('heading', { name: /This month/ }).closest('section')
    );
    expect(month.textContent).toContain('Money inIncome +€2,000.00');
    expect(month.textContent).toContain('Money outExpense -€120.00');
    expect(screen.getByText('1 over, 0 close to the limit')).toBeTruthy();
    expect(
      screen.getByRole('progressbar', { name: 'Eating out: 120% of budget spent' }),
    ).toBeTruthy();
    const upcoming = /** @type {HTMLElement} */ (
      screen.getByRole('heading', { name: 'Coming up in the next 30 days' }).closest('section')
    );
    expect(within(upcoming).getByText('Streaming')).toBeTruthy();
  });
});
