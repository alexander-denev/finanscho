import { beforeEach, describe, expect, it } from 'vitest';
import { createTestServices, makeAccount } from '../../helpers/testServices.js';

describe('BudgetService', () => {
  /** @type {Awaited<ReturnType<typeof createTestServices>>} */
  let t;
  /** @type {string} */
  let eurId;

  beforeEach(async () => {
    t = await createTestServices();
    await t.services.categories.seedDefaults();
    eurId = (await makeAccount(t, 'EUR account')).id;
  });

  /**
   * @param {string} date
   * @param {string} amount
   * @param {string} [categoryId]
   * @param {string} [accountId]
   */
  const spend = (date, amount, categoryId = 'seed:groceries', accountId = eurId) =>
    t.services.transactions.create({ kind: 'expense', date, amount, accountId, categoryId });

  it('computes spent, remaining, and status for a month', async () => {
    const usd = await makeAccount(t, 'USD account', '0', 'USD');
    await t.services.budgets.set({ categoryId: 'seed:groceries', month: '2024-05', limit: '100' });
    await spend('2024-05-01', '30');
    await spend('2024-05-31', '60');
    await spend('2024-04-30', '500');
    await spend('2024-05-10', '999', 'seed:groceries', usd.id);
    await spend('2024-05-10', '5', 'seed:dining');
    const { lines, unbudgeted } = await t.services.budgets.forMonth('2024-05');
    expect(lines).toHaveLength(1);
    expect(lines[0].progress).toMatchObject({
      spentMinor: 9000,
      remainingMinor: 1000,
      status: 'near',
    });
    expect(unbudgeted.some((c) => c.id === 'seed:groceries')).toBe(false);
    expect(unbudgeted.some((c) => c.id === 'seed:dining')).toBe(true);
    expect(unbudgeted.every((c) => c.kind === 'expense')).toBe(true);
  });

  it('updates the same deterministic budget and can remove it', async () => {
    const first = await t.services.budgets.set({
      categoryId: 'seed:dining',
      month: '2024-05',
      limit: '50',
    });
    t.clock.advance(1000);
    const second = await t.services.budgets.set({
      categoryId: 'seed:dining',
      month: '2024-05',
      limit: '80',
    });
    expect(second.id).toBe('seed:dining:2024-05');
    expect(second.createdAt).toBe(first.createdAt);
    expect((await t.services.budgets.forMonth('2024-05')).lines[0].budget.limitMinor).toBe(8000);
    await t.services.budgets.remove(second.id);
    expect((await t.services.budgets.forMonth('2024-05')).lines).toEqual([]);
  });

  it("copies last month's budgets without overwriting this month's", async () => {
    await t.services.budgets.set({ categoryId: 'seed:groceries', month: '2024-04', limit: '100' });
    await t.services.budgets.set({ categoryId: 'seed:dining', month: '2024-04', limit: '50' });
    await t.services.budgets.set({ categoryId: 'seed:travel', month: '2024-04', limit: '70' });
    await t.services.budgets.set({ categoryId: 'seed:dining', month: '2024-05', limit: '65' });
    await t.services.categories.setArchived('seed:travel', true);
    expect(await t.services.budgets.copyFromPreviousMonth('2024-05')).toBe(1);
    const lines = (await t.services.budgets.forMonth('2024-05')).lines;
    expect(Object.fromEntries(lines.map((l) => [l.category.id, l.budget.limitMinor]))).toEqual({
      'seed:groceries': 10_000,
      'seed:dining': 6_500,
    });
    expect(await t.services.budgets.copyFromPreviousMonth('2024-05')).toBe(0);
  });

  it('marks budgets the user sets or copies as theirs, so no older version copies them on', async () => {
    // As if an automation (or an older app's repeat switch) had set April.
    await t.repos.budgets.put({
      id: 'seed:groceries:2024-04',
      categoryId: 'seed:groceries',
      month: '2024-04',
      limitMinor: 100,
      currency: 'EUR',
      automationId: 'auto',
      recurring: true,
      createdAt: 'c',
      updatedAt: 'c',
      deleted: false,
    });
    await t.services.budgets.copyFromPreviousMonth('2024-05');
    await t.services.budgets.set({ categoryId: 'seed:groceries', month: '2024-04', limit: '2' });
    for (const month of ['2024-04', '2024-05']) {
      const [line] = (await t.services.budgets.forMonth(month)).lines;
      expect(line.budget).toMatchObject({ automationId: null, recurring: false });
    }
  });

  it('rejects budgets for income categories and bad months', async () => {
    await expect(
      t.services.budgets.set({ categoryId: 'seed:salary', month: '2024-05', limit: '1' }),
    ).rejects.toMatchObject({ fields: { categoryId: 'validation.categoryKind' } });
    await expect(t.services.budgets.forMonth('2024-13')).rejects.toMatchObject({
      fields: { month: 'validation.month' },
    });
  });
});
