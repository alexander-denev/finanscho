import { beforeEach, describe, expect, it } from 'vitest';
import { InUseError, ValidationError } from '../../../src/core/errors.js';
import { STORES } from '../../../src/infrastructure/db/database.js';
import { createTestServices, makeAccount } from '../../helpers/testServices.js';

/** @typedef {import('../../../src/core/domain/automation.js').AutomationInput} AutomationInput */
/** @typedef {import('../../../src/core/domain/transaction.js').Transaction} Transaction */

describe('AutomationService', () => {
  /** @type {Awaited<ReturnType<typeof createTestServices>>} */
  let t;
  /** @type {string} */
  let checking;
  /** @type {string} */
  let savings;

  beforeEach(async () => {
    // Today is Wednesday 2024-05-15.
    t = await createTestServices();
    await t.services.categories.seedDefaults();
    checking = (await makeAccount(t, 'Checking')).id;
    savings = (await makeAccount(t, 'Savings')).id;
  });

  /**
   * @param {Partial<AutomationInput>} [over]
   * @returns {AutomationInput}
   */
  const rent = (over = {}) => ({
    name: 'Rent',
    startDate: '2024-01-31',
    triggers: [
      {
        type: 'schedule',
        frequency: 'monthly',
        interval: 1,
        firstDate: '2024-01-31',
        lastDayOfMonth: true,
      },
    ],
    actions: [
      {
        type: 'createTransaction',
        template: {
          kind: 'expense',
          accountId: checking,
          categoryId: 'seed:housing',
          payee: 'Landlord',
          note: 'Rent {month}',
        },
        amount: { type: 'fixed', value: '800' },
      },
    ],
    ...over,
  });

  /**
   * @param {Partial<AutomationInput>} [over]
   * @returns {AutomationInput}
   */
  const save = (over = {}) => ({
    name: 'Save from salary',
    startDate: '2024-05-01',
    triggers: [{ type: 'transactionRecorded' }],
    conditions: {
      match: 'all',
      items: [
        { field: 'kind', op: 'is', kind: 'income' },
        { field: 'account', op: 'is', accountId: checking },
      ],
    },
    actions: [
      {
        type: 'createTransaction',
        template: { kind: 'transfer', accountId: checking, toAccountId: savings, note: 'Saved' },
        amount: { type: 'percent', value: '10' },
      },
    ],
    ...over,
  });

  /** @param {Partial<import('../../../src/core/domain/transaction.js').TransactionInput>} [over] */
  const income = (over = {}) =>
    t.services.transactions.create({
      kind: 'income',
      date: '2024-05-15',
      amount: '2500',
      accountId: checking,
      categoryId: 'seed:salary',
      payee: 'ACME',
      ...over,
    });

  /** @param {string} automationId */
  const made = async (automationId) =>
    (await t.services.automations.history(automationId)).transactions
      .map((tx) => [tx.date, tx.amountMinor, tx.note])
      .reverse();

  it('makes everything due on creation, once, and catches up as days pass', async () => {
    const automation = await t.services.automations.create(rent());
    expect(await made(automation.id)).toEqual([
      ['2024-01-31', 80_000, 'Rent January'],
      ['2024-02-29', 80_000, 'Rent February'],
      ['2024-03-31', 80_000, 'Rent March'],
      ['2024-04-30', 80_000, 'Rent April'],
    ]);
    const outbox = await t.db.getAll(STORES.outbox);
    expect(outbox.filter((op) => op.origin === 'automation')).toHaveLength(4);
    expect(await t.services.automations.run()).toBe(0);
    t.clock.set('2024-06-01T09:00:00.000Z');
    expect(await t.services.automations.run()).toBe(1);
    expect((await made(automation.id)).at(-1)).toEqual(['2024-05-31', 80_000, 'Rent May']);
  });

  it('never re-creates a result the user deleted', async () => {
    const automation = await t.services.automations.create(rent());
    const [first] = (await t.services.automations.history(automation.id)).transactions;
    await t.services.transactions.remove(first.id);
    expect(await t.services.automations.run()).toBe(0);
    expect(await made(automation.id)).toHaveLength(3);
  });

  it('reacts once to each recorded transaction that passes the If checks', async () => {
    const automation = await t.services.automations.create(save());
    const salary = await income();
    await income({ accountId: savings });
    await income({ kind: 'expense', categoryId: 'seed:groceries', amount: '10' });
    expect(await t.services.automations.run()).toBe(1);
    expect(await t.services.automations.run()).toBe(0);
    const [transfer] = (await t.services.automations.history(automation.id)).transactions;
    expect(transfer).toMatchObject({
      id: `${automation.id}:a0:${salary.id}`,
      kind: 'transfer',
      amountMinor: 25_000,
      date: '2024-05-15',
      automationId: automation.id,
    });
  });

  it('writes results with a clock every device derives the same way', async () => {
    const automation = await t.services.automations.create(save());
    t.clock.advance(60_000);
    const salary = await income();
    await t.services.automations.run();
    const [transfer] = (await t.services.automations.history(automation.id)).transactions;
    // The rule clock, so an edited automation's result beats an old one's; dated like the salary.
    expect(transfer.createdAt).toBe(salary.createdAt);
    const stored = await t.db.get(STORES.transactions, transfer.id);
    const rule = await t.db.get(STORES.automations, automation.id);
    expect(stored._clocks.amountMinor).toBe(rule._clocks.actions);
  });

  it('never lets automations set each other off, nor balance adjustments', async () => {
    await t.services.automations.create(save());
    // Reacts to every transfer into savings: would loop if automation-made ones counted.
    const echo = await t.services.automations.create(
      save({
        name: 'Echo',
        conditions: { match: 'all', items: [{ field: 'kind', op: 'is', kind: 'transfer' }] },
        actions: [
          {
            type: 'createTransaction',
            template: { kind: 'transfer', accountId: savings, toAccountId: checking },
            amount: { type: 'fixed', value: '1' },
          },
        ],
      }),
    );
    await income();
    await t.services.accounts.reconcile(checking, { balance: '99999' });
    await t.services.automations.run();
    expect(await made(echo.id)).toEqual([]);
  });

  it('only reacts to transactions dated in its window, and up to today', async () => {
    const automation = await t.services.automations.create(save());
    await income({ date: '2024-04-30' });
    await income({ date: '2024-05-16' });
    await t.services.automations.run();
    expect(await made(automation.id)).toEqual([]);
    t.clock.advanceDays(1);
    await t.services.automations.run();
    expect(await made(automation.id)).toEqual([['2024-05-16', 25_000, 'Saved']]);
  });

  it('reacts when an edit makes a transaction match', async () => {
    const automation = await t.services.automations.create(save());
    const moved = await income({ accountId: savings });
    await t.services.automations.run();
    await t.services.transactions.update(moved.id, {
      kind: 'income',
      date: '2024-05-15',
      amount: '2500',
      accountId: checking,
      categoryId: 'seed:salary',
      payee: 'ACME',
    });
    await t.services.automations.run();
    expect(await made(automation.id)).toHaveLength(1);
  });

  it('applies edits from today on, without touching or back-filling what exists', async () => {
    const automation = await t.services.automations.create(rent());
    const input = rent();
    const action = /** @type {any} */ (input.actions[0]);
    action.amount = { type: 'fixed', value: '850' };
    input.triggers.push({
      type: 'schedule',
      frequency: 'weekly',
      interval: 1,
      firstDate: '2024-01-01',
    });
    const edited = await t.services.automations.edit(automation.id, input);
    expect(edited.id).toBe(automation.id);
    expect(edited.startDate).toBe('2024-05-15');
    expect((await made(automation.id)).map(([date, amount]) => [date, amount])).toEqual([
      ['2024-01-31', 80_000],
      ['2024-02-29', 80_000],
      ['2024-03-31', 80_000],
      ['2024-04-30', 80_000],
    ]);
    t.clock.set('2024-05-31T09:00:00.000Z');
    await t.services.automations.run();
    const after = (await made(automation.id)).slice(4).map(([date, amount]) => [date, amount]);
    // Mondays from 2024-05-20, and the month end at the new amount.
    expect(after).toEqual([
      ['2024-05-20', 85_000],
      ['2024-05-27', 85_000],
      ['2024-05-31', 85_000],
    ]);
  });

  it('renames without moving the start', async () => {
    const automation = await t.services.automations.create(rent());
    const edited = await t.services.automations.edit(automation.id, rent({ name: 'Flat' }));
    expect(edited).toMatchObject({ name: 'Flat', startDate: '2024-01-31' });
  });

  it('stops from today and resumes without filling the pause', async () => {
    const automation = await t.services.automations.create(save());
    await t.services.automations.stop(automation.id);
    expect((await t.services.automations.get(automation.id)).endDate).toBe('2024-05-14');
    await income();
    t.clock.advanceDays(3);
    await income({ date: '2024-05-17' });
    await t.services.automations.resume(automation.id);
    expect(await t.services.automations.get(automation.id)).toMatchObject({
      startDate: '2024-05-18',
      endDate: null,
    });
    await income({ date: '2024-05-18' });
    await t.services.automations.run();
    expect(await made(automation.id)).toEqual([['2024-05-18', 25_000, 'Saved']]);
  });

  it('sets budgets once per month and leaves months the user set alone', async () => {
    await t.services.budgets.set({ categoryId: 'seed:groceries', month: '2024-04', limit: '50' });
    const automation = await t.services.automations.create(
      rent({
        name: 'Groceries budget',
        startDate: '2024-03-01',
        triggers: [
          { type: 'schedule', frequency: 'monthly', interval: 1, firstDate: '2024-03-01' },
        ],
        actions: [
          {
            type: 'setBudget',
            categoryId: 'seed:groceries',
            amount: { type: 'fixed', value: '300' },
          },
        ],
      }),
    );
    const { budgets } = await t.services.automations.history(automation.id);
    expect(budgets.map((b) => [b.month, b.limitMinor, b.currency])).toEqual([
      ['2024-05', 30_000, 'EUR'],
      ['2024-03', 30_000, 'EUR'],
    ]);
    await t.services.budgets.set({ categoryId: 'seed:groceries', month: '2024-05', limit: '320' });
    const after = await t.services.automations.history(automation.id);
    expect(after.budgets.map((b) => b.month)).toEqual(['2024-03']);
  });

  it('runs now with fresh IDs, and refuses steps that need a recorded transaction', async () => {
    const automation = await t.services.automations.create(rent({ startDate: '2024-05-16' }));
    expect(await t.services.automations.runNow(automation.id)).toEqual({
      transactions: 1,
      budgets: 0,
    });
    const [ran] = (await t.services.automations.history(automation.id)).transactions;
    expect(ran.id.startsWith(`${automation.id}:run:`)).toBe(true);
    expect(ran).toMatchObject({ date: '2024-05-15', note: 'Rent May' });
    const percent = await t.services.automations.create(save());
    await expect(t.services.automations.runNow(percent.id)).rejects.toBeInstanceOf(ValidationError);
  });

  it('previews what would happen without writing anything', async () => {
    await income({ payee: 'ACME', date: '2024-05-10' });
    const before = (await t.db.getAll(STORES.outbox)).length;
    const preview = await t.services.automations.preview(save({ name: '' }));
    expect(preview.dates).toEqual([]);
    expect(preview.matches.map((m) => [m.source.date, m.results[0].record.id])).toEqual([
      ['2024-05-10', expect.stringMatching(/^preview:a0:/)],
    ]);
    const schedule = await t.services.automations.preview(
      rent({
        startDate: '2024-05-15',
        triggers: [
          {
            type: 'schedule',
            frequency: 'monthly',
            interval: 1,
            firstDate: '2024-06-01',
            weekend: 'before',
          },
        ],
      }),
    );
    // 2024-06-01 is a Saturday: the rent lands on Friday 2024-05-31, named for June.
    expect(schedule.dates[0].date).toBe('2024-05-31');
    expect(/** @type {Transaction} */ (schedule.dates[0].results[0].record).note).toBe('Rent June');
    expect((await t.db.getAll(STORES.outbox)).length).toBe(before);
  });

  it('lists what schedules make in the next 30 days', async () => {
    await t.services.automations.create(rent());
    const upcoming = await t.services.automations.upcoming();
    expect(upcoming.map((u) => [u.name, u.date, u.transaction.amountMinor])).toEqual([
      ['Rent', '2024-05-31', 80_000],
    ]);
  });

  it('makes at most 366 results per automation per run', async () => {
    const automation = await t.services.automations.create(
      rent({
        startDate: '2022-01-01',
        triggers: [{ type: 'schedule', frequency: 'daily', interval: 1, firstDate: '2022-01-01' }],
      }),
    );
    expect(await made(automation.id)).toHaveLength(366);
    expect(await t.services.automations.run()).toBe(366);
  });

  it('runs one at a time and once more for calls made meanwhile', async () => {
    await t.services.automations.create(save());
    await income();
    const [a, b] = await Promise.all([t.services.automations.run(), t.services.automations.run()]);
    expect(a).toBe(b);
    expect(a).toBe(1);
  });

  it('keeps accounts and categories it uses from being deleted', async () => {
    const other = await makeAccount(t, 'Spare');
    await t.services.automations.create(
      save({
        conditions: {
          match: 'any',
          items: [{ field: 'account', op: 'isNot', accountId: other.id }],
        },
      }),
    );
    await expect(t.services.accounts.remove(other.id)).rejects.toBeInstanceOf(InUseError);
    await expect(t.services.categories.remove('seed:housing')).resolves.toBeUndefined();
  });
});
