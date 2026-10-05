import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { AutomationEditorPage } from '../../../../src/ui/features/automations/AutomationEditorPage.jsx';
import { createUiStores, renderWithStores } from '../../../helpers/renderWithStores.jsx';

/** @typedef {Awaited<ReturnType<typeof createUiStores>>} Ui */

// Today is Wednesday 2024-05-15.

/**
 * @param {Record<string, string> | ((ui: Ui) => Record<string, string>)} [params] page params, or
 *   a function that works them out after seeding
 * @param {(ui: Ui, ids: { checking: string, savings: string }) => Promise<void>} [seed]
 */
async function setup(params = {}, seed) {
  const ui = await createUiStores({ path: '/automations/new' });
  /** @param {string} name */
  const account = async (name) =>
    (
      await ui.stores.accounts.create({
        name,
        type: 'checking',
        currency: 'EUR',
        openingBalance: '0',
      })
    ).id;
  const ids = { checking: await account('Checking'), savings: await account('Savings') };
  if (seed) await seed(ui, ids);
  await ui.settled();
  const pageParams = typeof params === 'function' ? params(ui) : params;
  renderWithStores(<AutomationEditorPage params={pageParams} />, ui.stores);
  return { ...ui, ...ids };
}

/**
 * Opens the first saved automation's page.
 * @param {Ui} ui
 * @returns {Record<string, string>}
 */
const savedRent = (ui) => ({ id: ui.stores.automations.automations.value[0].automation.id });

/**
 * @param {string} name the section's heading
 * @returns {HTMLElement}
 */
const section = (name) => screen.getByRole('region', { name });

/**
 * Opens "+ Add" in a section and picks a kind.
 * @param {string} addLabel e.g. "Add a When"
 * @param {RegExp} kind
 */
async function add(addLabel, kind) {
  fireEvent.click(screen.getByRole('button', { name: addLabel }));
  const chooser = await screen.findByRole('dialog', { name: addLabel });
  fireEvent.click(within(chooser).getByRole('button', { name: kind }));
}

/** @param {string} title */
const dialog = (title) => screen.findByRole('dialog', { name: title });

/** @param {HTMLElement} d */
async function done(d) {
  fireEvent.click(within(d).getByRole('button', { name: 'Done' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
}

/**
 * Adds "Expense <amount> · Checking".
 * @param {string} amount
 */
async function addExpenseStep(amount) {
  await add('Add a step', /^Create a transaction/);
  const d = await dialog('Create a transaction');
  fireEvent.input(within(d).getByLabelText('Amount'), { target: { value: amount } });
  await done(d);
}

describe('AutomationEditorPage', () => {
  it('starts empty, without checks until something reacts to transactions', async () => {
    await setup();
    expect(section('When').textContent).toContain('Nothing starts this automation yet.');
    expect(section('Do').textContent).toContain('No steps yet.');
    expect(screen.queryByRole('region', { name: 'If' })).toBeNull();
  });

  it('adds a weekly schedule by tapping days, and can’t change what kind of item it is', async () => {
    await setup();
    await add('Add a When', /^On a schedule/);
    const d = await dialog('Schedule');
    expect(within(d).queryByLabelText('Trigger')).toBeNull();
    fireEvent.change(within(d).getByLabelText('Unit'), { target: { value: 'week' } });
    // Today's weekday starts selected.
    const wednesday = within(d).getByRole('button', { name: 'Wednesday' });
    expect(wednesday.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(wednesday);
    fireEvent.click(within(d).getByRole('button', { name: 'Monday' }));
    fireEvent.click(within(d).getByRole('button', { name: 'Tuesday' }));
    await done(d);
    expect(
      within(section('When')).getByRole('button', { name: 'Every week on Mon, Tue' }),
    ).toBeTruthy();
  });

  it('cancels a new item without adding it, and deletes an existing one', async () => {
    await setup();
    await add('Add a step', /^Set a budget/);
    fireEvent.click(within(await dialog('Set a budget')).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(section('Do').textContent).toContain('No steps yet.');

    await addExpenseStep('12');
    const line = within(section('Do')).getByRole('button', { name: /Expense €12.00/ });
    fireEvent.click(line);
    const d = await dialog('Create a transaction');
    expect(within(d).queryByLabelText('Step')).toBeNull();
    fireEvent.click(within(d).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(section('Do').textContent).toContain('No steps yet.'));
  });

  it('keeps a step’s window open while its own fields are wrong', async () => {
    await setup();
    await add('Add a step', /^Create a transaction/);
    const d = await dialog('Create a transaction');
    fireEvent.click(within(d).getByRole('button', { name: 'Done' }));
    expect(await within(d).findByText('Enter an amount.')).toBeTruthy();
  });

  it('repeats every 2 weeks from next week, without a starting date', async () => {
    const ui = await setup();
    await add('Add a When', /^On a schedule/);
    const d = await dialog('Schedule');
    fireEvent.input(within(d).getByLabelText('Repeat every'), { target: { value: '2' } });
    fireEvent.change(within(d).getByLabelText('Unit'), { target: { value: 'week' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Wednesday' }));
    fireEvent.click(within(d).getByRole('button', { name: 'Friday' }));
    fireEvent.change(within(d).getByLabelText('First time'), { target: { value: '1' } });
    await done(d);
    expect(
      within(section('When')).getByRole('button', { name: 'Every 2 weeks on Fri' }),
    ).toBeTruthy();
    await addExpenseStep('5');
    fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Allowance' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save automation' }));
    await waitFor(() => expect(ui.stores.router.currentPath.value).toBe('/automations'));
    const upcoming = await ui.services.automations.upcoming();
    expect(upcoming.map((u) => u.date)).toEqual(['2024-05-24', '2024-06-07']);
  });

  it('edits a group of checks in its own window', async () => {
    await setup();
    await add('Add a When', /^When a transaction is recorded/);
    expect(section('If').textContent).toContain('No checks');
    await add('Add a check', /^Group/);
    const d = await dialog('Group of checks');
    fireEvent.click(within(d).getByRole('button', { name: 'Add check' }));
    fireEvent.click(within(d).getByRole('button', { name: 'Payee' }));
    fireEvent.input(within(d).getByLabelText('Value'), { target: { value: 'ACME' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Add check' }));
    fireEvent.click(within(d).getByRole('button', { name: 'Amount' }));
    fireEvent.input(within(d).getAllByLabelText('Value')[1], { target: { value: '1000' } });
    await done(d);
    expect(
      within(section('If')).getByRole('button', {
        name: 'Any of: Payee contains “ACME”, Amount is at least €1,000.00',
      }),
    ).toBeTruthy();
  });

  it('marks the item that needs attention when saving fails', async () => {
    await setup();
    await add('Add a When', /^When a transaction is recorded/);
    await add('Add a step', /^Create a transaction/);
    const d = await dialog('Create a transaction');
    fireEvent.click(within(d).getByRole('radio', { name: '% of the recorded transaction' }));
    fireEvent.input(within(d).getByLabelText('Percent'), { target: { value: '10' } });
    await done(d);
    // A schedule too: a percentage now has no recorded transaction on those dates.
    await add('Add a When', /^On a schedule/);
    await done(await dialog('Schedule'));
    fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Save' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save automation' }));
    const step = await within(section('Do')).findByRole('button', { name: /Needs attention/ });
    expect(step.textContent).toContain('Expense 10%');
  });

  it('saves changes to a saved automation, or throws them away on Cancel', async () => {
    const ui = await setup(savedRent, async (u, ids) => {
      await u.stores.automations.create({
        name: 'Rent',
        startDate: '2024-05-01',
        triggers: [
          { type: 'schedule', every: 1, unit: 'month', monthDay: { kind: 'day', day: 1 } },
        ],
        actions: [
          {
            type: 'createTransaction',
            template: { kind: 'expense', accountId: ids.checking },
            amount: { type: 'fixed', value: '800' },
          },
        ],
      });
    });
    expect(screen.getByRole('heading', { name: 'Rent' })).toBeTruthy();
    expect(
      within(section('When')).getByRole('button', { name: 'Every month on day 1' }),
    ).toBeTruthy();
    fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Flat' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(ui.stores.router.currentPath.value).toBe('/automations');
    expect(ui.stores.automations.automations.value[0].automation.name).toBe('Rent');
  });

  it('runs now, shows the history, and stops from the automation’s page', async () => {
    const ui = await setup(savedRent, async (u, ids) => {
      await u.stores.automations.create({
        name: 'Rent',
        startDate: '2024-05-01',
        triggers: [
          { type: 'schedule', every: 1, unit: 'month', monthDay: { kind: 'day', day: 1 } },
        ],
        actions: [
          {
            type: 'createTransaction',
            template: { kind: 'expense', accountId: ids.checking, note: 'Rent {month}' },
            amount: { type: 'fixed', value: '800' },
          },
        ],
      });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Run now' }));
    await waitFor(() =>
      expect(ui.stores.toasts.toasts.value.map((x) => x.key)).toContain('toast.automationRan'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'History' }));
    const history = await dialog('Made by “Rent”');
    expect(within(history).getAllByText('Rent May')).toHaveLength(2);
    fireEvent.click(within(history).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    fireEvent.click(within(await dialog('Stop')).getByRole('button', { name: 'Stop' }));
    await waitFor(() => expect(ui.stores.router.currentPath.value).toBe('/automations'));
    expect(ui.stores.automations.automations.value[0].running).toBe(false);
  });

  it('starts with a monthly Set budget step when coming from a budget', async () => {
    await setup({ categoryId: 'seed:dining', limit: '80' });
    expect(
      within(section('When')).getByRole('button', { name: 'Every month on day 1' }),
    ).toBeTruthy();
    expect(
      within(section('Do')).getByRole('button', { name: 'Set Eating out budget to €80.00' }),
    ).toBeTruthy();
    expect(screen.getByLabelText('Name').getAttribute('placeholder')).toBe('Eating out');
  });
});
