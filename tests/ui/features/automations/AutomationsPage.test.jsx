import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { AutomationsPage } from '../../../../src/ui/features/automations/AutomationsPage.jsx';
import { createUiStores, renderWithStores } from '../../../helpers/renderWithStores.jsx';

/** @typedef {Awaited<ReturnType<typeof createUiStores>>} Ui */

/**
 * @param {string} [path]
 * @param {Record<string, string>} [params]
 * @returns {Promise<Ui & { checking: string, savings: string }>}
 */
async function setup(path = '/automations', params = {}) {
  const ui = await createUiStores({ path });
  const checking = (
    await ui.stores.accounts.create({
      name: 'Checking',
      type: 'checking',
      currency: 'EUR',
      openingBalance: '0',
    })
  ).id;
  const savings = (
    await ui.stores.accounts.create({
      name: 'Savings',
      type: 'savings',
      currency: 'EUR',
      openingBalance: '0',
    })
  ).id;
  await ui.settled();
  renderWithStores(<AutomationsPage params={params} />, ui.stores);
  return { ...ui, checking, savings };
}

/**
 * @param {Ui} ui
 * @param {string} accountId
 */
const createRent = (ui, accountId) =>
  ui.stores.automations.create({
    name: 'Rent',
    startDate: '2024-05-01',
    triggers: [{ type: 'schedule', frequency: 'monthly', interval: 1, firstDate: '2024-05-01' }],
    actions: [
      {
        type: 'createTransaction',
        template: { kind: 'expense', accountId, categoryId: 'seed:housing', note: 'Rent {month}' },
        amount: { type: 'fixed', value: '800' },
      },
    ],
  });

describe('AutomationsPage', () => {
  it('creates a scheduled automation with a fill-in word, and lists it', async () => {
    const ui = await setup();
    expect(screen.getByRole('heading', { name: 'No automations yet' })).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Create automation' })[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Create automation' });
    fireEvent.input(within(dialog).getByLabelText('Amount'), { target: { value: '800' } });
    fireEvent.input(within(dialog).getByLabelText('Payee (optional)'), {
      target: { value: 'Landlord' },
    });
    fireEvent.input(within(dialog).getByLabelText('Note (optional)'), {
      target: { value: 'Rent' },
    });
    // The second "Fill-in words" button belongs to the note.
    const help = within(dialog).getAllByRole('button', { name: /Fill-in words/ })[1];
    fireEvent.click(help);
    expect(help.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(within(dialog).getByRole('button', { name: '{month}' }));
    expect(
      /** @type {HTMLInputElement} */ (within(dialog).getByLabelText('Note (optional)')).value,
    ).toBe('Rent {month}');
    fireEvent.keyDown(help, { key: 'Escape' });
    expect(help.getAttribute('aria-expanded')).toBe('false');
    // The name defaults to the payee when left empty.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save automation' }));

    const list = await screen.findByRole('list', { name: 'Automations' });
    const row = await within(list).findByRole('button', { name: /Landlord/ });
    expect(row.textContent).toContain('Monthly · 1 step · Next: Jun 15, 2024');
    // Saving finishes (and the dialog closes) once today's transaction is made.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const [summary] = ui.stores.automations.automations.value;
    const { transactions } = await ui.services.automations.history(summary.automation.id);
    expect(transactions.map((tx) => [tx.date, tx.note])).toEqual([['2024-05-15', 'Rent May']]);
  });

  it('builds "When … If A and (B or C) … Do two steps" with percentages', async () => {
    const ui = await setup();
    fireEvent.click(screen.getAllByRole('button', { name: 'Create automation' })[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Create automation' });
    fireEvent.input(within(dialog).getByLabelText('Name'), { target: { value: 'Save' } });
    fireEvent.change(within(dialog).getByLabelText('Trigger'), {
      target: { value: 'transactionRecorded' },
    });

    // If: income (A) and a group: payee contains ACME (B) or amount at least 1000 (C).
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add check' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add group' }));
    const checks = within(dialog).getAllByLabelText('Check');
    fireEvent.change(checks[1], { target: { value: 'payee' } });
    fireEvent.input(within(dialog).getAllByLabelText('Value')[1], { target: { value: 'ACME' } });
    fireEvent.click(within(dialog).getAllByRole('button', { name: 'Add check' })[0]);
    fireEvent.change(within(dialog).getAllByLabelText('Check')[2], {
      target: { value: 'amount' },
    });
    fireEvent.input(within(dialog).getAllByLabelText('Value')[2], { target: { value: '1000' } });

    // Do: 10% to savings, then a second step with 5%.
    fireEvent.click(within(dialog).getByRole('radio', { name: '% of the recorded transaction' }));
    fireEvent.input(within(dialog).getByLabelText('Percent'), { target: { value: '10' } });
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Transfer' }));
    fireEvent.change(within(dialog).getByLabelText('From account'), {
      target: { value: ui.checking },
    });
    fireEvent.change(within(dialog).getByLabelText('To account'), {
      target: { value: ui.savings },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add step' }));
    const percents = within(dialog).getAllByRole('radio', {
      name: '% of the recorded transaction',
    });
    fireEvent.click(percents[1]);
    fireEvent.input(within(dialog).getAllByLabelText('Percent')[1], { target: { value: '5' } });
    fireEvent.change(within(dialog).getAllByLabelText('Account')[0], {
      target: { value: ui.savings },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save automation' }));

    await screen.findByRole('button', { name: /^Save/ });
    const [summary] = ui.stores.automations.automations.value;
    expect(summary.automation.conditions).toEqual({
      match: 'all',
      items: [
        { field: 'kind', op: 'is', kind: 'income' },
        {
          match: 'any',
          items: [
            { field: 'payee', op: 'contains', text: 'ACME' },
            { field: 'amount', op: 'atLeast', amountMinor: 100_000, currency: 'EUR' },
          ],
        },
      ],
    });
    expect(summary.automation.actions.map((a) => a.amount)).toEqual([
      { type: 'percent', basisPoints: 1000 },
      { type: 'percent', basisPoints: 500 },
    ]);
  });

  it('previews the next dates while the form is filled in', async () => {
    await setup();
    fireEvent.click(screen.getAllByRole('button', { name: 'Create automation' })[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Create automation' });
    const preview = within(dialog).getByRole('region', { name: 'Preview' });
    expect(preview.textContent).toContain('Fill in the form');
    fireEvent.input(within(dialog).getByLabelText('Amount'), { target: { value: '12' } });
    await waitFor(() => expect(preview.textContent).toContain('Next dates'));
    expect(preview.textContent).toContain('-€12.00');
  });

  it('shows errors inline when the input cannot work', async () => {
    await setup();
    fireEvent.click(screen.getAllByRole('button', { name: 'Create automation' })[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Create automation' });
    fireEvent.input(within(dialog).getByLabelText('Note (optional)'), {
      target: { value: '{mnth}' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save automation' }));
    expect(await within(dialog).findByText('Enter an amount.')).toBeTruthy();
    expect(within(dialog).getByText(/A word in curly braces/)).toBeTruthy();
  });

  it('edits in place, keeps the history, runs now, stops, and resumes', async () => {
    const ui = await setup();
    const rent = await createRent(ui, ui.checking);
    await ui.settled();
    fireEvent.click(await screen.findByRole('button', { name: /Rent/ }));
    let dialog = await screen.findByRole('dialog', { name: 'Change automation' });
    expect(within(dialog).getByText(/Changes apply from today on/)).toBeTruthy();
    fireEvent.input(within(dialog).getByLabelText('Amount'), { target: { value: '850' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save automation' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const [edited] = ui.stores.automations.automations.value;
    expect(edited.automation).toMatchObject({ id: rent.id, startDate: '2024-05-15' });

    fireEvent.click(screen.getByRole('button', { name: /Rent/ }));
    dialog = await screen.findByRole('dialog', { name: 'Change automation' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Run now' }));
    await waitFor(() =>
      expect(ui.stores.toasts.toasts.value.map((x) => x.key)).toContain('toast.automationRan'),
    );

    fireEvent.click(screen.getByRole('button', { name: /Rent/ }));
    dialog = await screen.findByRole('dialog', { name: 'Change automation' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'History' }));
    const history = await screen.findByRole('dialog', { name: 'Made by “Rent”' });
    expect(within(history).getAllByText('Rent May')).toHaveLength(2);
    fireEvent.click(within(history).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: /Rent/ }));
    dialog = await screen.findByRole('dialog', { name: 'Change automation' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Stop' }));
    const confirm = await screen.findByRole('dialog', { name: 'Stop' });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Stop' }));
    const stopped = await screen.findByRole('list', { name: 'Stopped' });
    fireEvent.click(within(stopped).getByRole('button', { name: /Rent/ }));
    dialog = await screen.findByRole('dialog', { name: 'Change automation' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Resume' }));
    await screen.findByRole('list', { name: 'Automations' });
    expect(screen.queryByRole('list', { name: 'Stopped' })).toBeNull();
  });

  it('opens an automation from its link, and returns to the list when closed', async () => {
    const ui = await createUiStores({ path: '/automations' });
    const account = await ui.stores.accounts.create({
      name: 'Main',
      type: 'checking',
      currency: 'EUR',
      openingBalance: '0',
    });
    const rent = await createRent(ui, account.id);
    await ui.settled();
    ui.stores.router.navigate(`/automations/${rent.id}`);
    renderWithStores(<AutomationsPage params={{ id: rent.id }} />, ui.stores);
    const dialog = await screen.findByRole('dialog', { name: 'Change automation' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(ui.stores.router.currentPath.value).toBe('/automations');
  });

  it('starts a monthly budget automation from a budget', async () => {
    await setup('/automations/new/budget/seed%3Adining/80', {
      categoryId: 'seed:dining',
      limit: '80',
    });
    const dialog = await screen.findByRole('dialog', { name: 'Create automation' });
    expect(/** @type {HTMLSelectElement} */ (within(dialog).getByLabelText('Step')).value).toBe(
      'setBudget',
    );
    expect(/** @type {HTMLSelectElement} */ (within(dialog).getByLabelText('Category')).value).toBe(
      'seed:dining',
    );
    expect(
      /** @type {HTMLInputElement} */ (within(dialog).getByLabelText('Monthly limit')).value,
    ).toBe('80');
    expect(within(dialog).getByRole('textbox', { name: 'Name' }).getAttribute('placeholder')).toBe(
      'Eating out',
    );
  });
});
