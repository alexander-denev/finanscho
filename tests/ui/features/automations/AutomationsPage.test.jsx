import { describe, expect, it } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/preact';
import { AutomationsPage } from '../../../../src/ui/features/automations/AutomationsPage.jsx';
import { createUiStores, renderWithStores } from '../../../helpers/renderWithStores.jsx';

describe('AutomationsPage', () => {
  it('invites to create the first automation', async () => {
    const ui = await createUiStores({ path: '/automations' });
    renderWithStores(<AutomationsPage />, ui.stores);
    expect(screen.getByRole('heading', { name: 'No automations yet' })).toBeTruthy();
    const links = screen.getAllByRole('link', { name: 'Create automation' });
    expect(links[0].getAttribute('href')).toBe('/automations/new');
  });

  it('lists automations with their schedule, and opens one on its own page', async () => {
    const ui = await createUiStores({ path: '/automations' });
    const account = await ui.stores.accounts.create({
      name: 'Main',
      type: 'checking',
      currency: 'EUR',
      openingBalance: '0',
    });
    const rent = await ui.stores.automations.create({
      name: 'Rent',
      startDate: '2024-05-01',
      triggers: [
        {
          type: 'schedule',
          every: 1,
          unit: 'month',
          monthDay: { kind: 'day', day: 31 },
          weekend: 'before',
        },
      ],
      actions: [
        {
          type: 'createTransaction',
          template: { kind: 'expense', accountId: account.id },
          amount: { type: 'fixed', value: '800' },
        },
      ],
    });
    await ui.settled();
    renderWithStores(<AutomationsPage />, ui.stores);
    const list = screen.getByRole('list', { name: 'Automations' });
    const row = within(list).getByRole('button', { name: /Rent/ });
    expect(row.textContent).toContain(
      'Every month on the last day, Friday before weekends · 1 step · Next: May 31, 2024',
    );
    fireEvent.click(row);
    expect(ui.stores.router.currentPath.value).toBe(`/automations/${rent.id}`);
  });
});
