import { beforeEach, describe, expect, it } from 'vitest';
import { STORES } from '../../../src/infrastructure/db/database.js';
import { createTestServices, makeAccount } from '../../helpers/testServices.js';

describe('RecurringService', () => {
  /** @type {Awaited<ReturnType<typeof createTestServices>>} */
  let t;
  /** @type {string} */
  let accountId;

  beforeEach(async () => {
    t = await createTestServices();
    await t.services.categories.seedDefaults();
    accountId = (await makeAccount(t)).id;
  });

  /**
   * @param {Partial<import('../../../src/core/domain/recurringRule.js').RecurringRuleInput>} [over]
   */
  const input = (over = {}) => ({
    frequency: 'monthly',
    interval: 1,
    startDate: '2024-01-31',
    endDate: null,
    template: {
      kind: 'expense',
      amount: '9.99',
      accountId,
      categoryId: 'seed:subscriptions',
      payee: 'Stream',
    },
    ...over,
  });

  /** @param {string} ruleId */
  const occurrenceDates = async (ruleId) =>
    (await t.services.transactions.query({ limit: 1000 })).items
      .filter((tx) => tx.recurringRuleId === ruleId)
      .map((tx) => tx.date)
      .sort();

  it('materializes due occurrences up to today on creation, with month-end clamping', async () => {
    // Today is 2024-05-15.
    const rule = await t.services.recurring.create(input());
    expect(await occurrenceDates(rule.id)).toEqual([
      '2024-01-31',
      '2024-02-29',
      '2024-03-31',
      '2024-04-30',
    ]);
    const outbox = await t.db.getAll(STORES.outbox);
    expect(outbox.filter((op) => op.origin === 'recurrence')).toHaveLength(4);
  });

  it('is idempotent and catches up as days pass', async () => {
    const rule = await t.services.recurring.create(input());
    expect(await t.services.recurring.materialize()).toBe(0);
    t.clock.set('2024-06-01T09:00:00.000Z');
    expect(await t.services.recurring.materialize()).toBe(1);
    expect((await occurrenceDates(rule.id)).at(-1)).toBe('2024-05-31');
  });

  it('never recreates an occurrence the user deleted', async () => {
    const rule = await t.services.recurring.create(input());
    await t.services.transactions.remove(`${rule.id}:2024-02-29`);
    expect(await t.services.recurring.materialize()).toBe(0);
    expect(await occurrenceDates(rule.id)).not.toContain('2024-02-29');
  });

  it('caps catch-up at 366 occurrences per rule per run', async () => {
    const rule = await t.services.recurring.create(
      input({ frequency: 'daily', startDate: '2022-01-01' }),
    );
    expect(await occurrenceDates(rule.id)).toHaveLength(366);
    expect(await t.services.recurring.materialize()).toBe(366);
    const total = 366 + 366 + (await t.services.recurring.materialize());
    // 2022-01-01 … 2024-05-15 inclusive is 866 days.
    expect(total).toBe(866);
    expect(await t.services.recurring.materialize()).toBe(0);
  });

  it('edits by ending the old rule and starting a new one', async () => {
    const old = await t.services.recurring.create(input());
    const replacement = await t.services.recurring.edit(
      old.id,
      input({ startDate: '2024-06-30', template: { ...input().template, amount: '12.99' } }),
    );
    expect((await t.services.recurring.get(old.id)).endDate).toBe('2024-06-29');
    expect(replacement.startDate).toBe('2024-06-30');
    expect(replacement.template.amountMinor).toBe(1299);
    const upcoming = await t.services.recurring.upcoming(60);
    expect(upcoming.map((u) => [u.ruleId === old.id ? 'old' : 'new', u.date])).toEqual([
      ['old', '2024-05-31'],
      ['new', '2024-06-30'],
    ]);
  });

  it('keeps occurrences when a rule is stopped or deleted', async () => {
    const rule = await t.services.recurring.create(input());
    await t.services.recurring.stop(rule.id);
    expect((await t.services.recurring.get(rule.id)).endDate).toBe('2024-05-15');
    expect(await t.services.recurring.upcoming()).toEqual([]);
    await t.services.recurring.remove(rule.id);
    expect(await t.services.recurring.list()).toEqual([]);
    expect(await occurrenceDates(rule.id)).toHaveLength(4);
  });

  it('lists rules with their next date and upcoming occurrences within 30 days', async () => {
    await t.services.recurring.create(input());
    await t.services.recurring.create(
      input({
        frequency: 'weekly',
        startDate: '2024-05-13',
        template: { ...input().template, payee: 'Gym' },
      }),
    );
    const [monthly, weekly] = await t.services.recurring.list();
    expect(monthly.nextDate).toBe('2024-05-31');
    expect(weekly.nextDate).toBe('2024-05-20');
    const dates = (await t.services.recurring.upcoming()).map((u) => u.date);
    expect(dates).toEqual(['2024-05-20', '2024-05-27', '2024-05-31', '2024-06-03', '2024-06-10']);
  });

  it('validates the template', async () => {
    await expect(
      t.services.recurring.create(input({ template: { ...input().template, amount: '' } })),
    ).rejects.toMatchObject({ fields: { amount: 'validation.money.empty' } });
  });
});
