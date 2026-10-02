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
    expect(replacement.previousRuleId).toBe(old.id);
    expect((await t.services.recurring.list()).map((s) => s.rule.id)).toEqual([replacement.id]);
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

  it('changes only the end date in place when the transaction and cadence stay the same', async () => {
    const rule = await t.services.recurring.create(input());
    const edited = await t.services.recurring.edit(
      rule.id,
      input({ startDate: '2024-05-31', endDate: '2024-12-31' }),
    );
    expect(edited.id).toBe(rule.id);
    expect(edited.endDate).toBe('2024-12-31');
    expect((await t.services.recurring.list()).map((s) => s.rule.id)).toEqual([rule.id]);
  });

  it('resumes a stopped rule in place, keeping its anchor day and skipping missed dates', async () => {
    const rule = await t.services.recurring.create(input());
    await t.services.recurring.stop(rule.id);
    t.clock.set('2024-08-10T09:00:00.000Z');
    const [stopped] = await t.services.recurring.list();
    expect(stopped).toMatchObject({ nextDate: null, resumeDate: '2024-08-31' });

    expect(await t.services.recurring.resume(rule.id)).toBe('2024-08-31');
    const [resumed] = await t.services.recurring.list();
    expect(resumed.rule.id).toBe(rule.id);
    expect(resumed.rule.endDate).toBeNull();
    expect(resumed.nextDate).toBe('2024-08-31');

    t.clock.set('2024-10-01T09:00:00.000Z');
    await t.services.recurring.materialize();
    // May 31, Jun 30, and Jul 31 fell while it was stopped; the anchor stays on the 31st.
    expect(await occurrenceDates(rule.id)).toEqual([
      '2024-01-31',
      '2024-02-29',
      '2024-03-31',
      '2024-04-30',
      '2024-08-31',
      '2024-09-30',
    ]);
  });

  it('does not create a second transaction when stopped and resumed on a due day', async () => {
    const rule = await t.services.recurring.create(input({ startDate: '2024-04-15' }));
    expect(await occurrenceDates(rule.id)).toEqual(['2024-04-15', '2024-05-15']);
    await t.services.recurring.stop(rule.id);
    expect(await t.services.recurring.resume(rule.id)).toBe('2024-06-15');
    expect(await occurrenceDates(rule.id)).toEqual(['2024-04-15', '2024-05-15']);
    expect(await t.services.recurring.list()).toHaveLength(1);
  });

  it('keeps skipped dates skipped after they shrink to stubs, beyond the catch-up cap', async () => {
    const rule = await t.services.recurring.create(
      input({ frequency: 'daily', startDate: '2024-05-14' }),
    );
    await t.services.recurring.stop(rule.id);
    t.clock.set('2025-08-01T09:00:00.000Z');
    await t.services.recurring.resume(rule.id);
    // 442 skipped days, more than MATERIALIZE_CAP, shrink to stubs without `recurringRuleId`.
    await t.recorder.pruneTombstones(t.clock.nowMs() + 31 * 86_400_000);
    t.clock.set('2025-08-03T09:00:00.000Z');
    expect(await t.services.recurring.materialize()).toBe(2);
    expect(await occurrenceDates(rule.id)).toEqual([
      '2024-05-14',
      '2024-05-15',
      '2025-08-01',
      '2025-08-02',
      '2025-08-03',
    ]);
  });

  it('validates the template', async () => {
    await expect(
      t.services.recurring.create(input({ template: { ...input().template, amount: '' } })),
    ).rejects.toMatchObject({ fields: { amount: 'validation.money.empty' } });
  });
});
