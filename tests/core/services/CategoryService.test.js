import { describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORIES } from '../../../src/core/domain/category.js';
import { InUseError, NotFoundError } from '../../../src/core/errors.js';
import { createTestServices, makeAccount } from '../../helpers/testServices.js';

describe('CategoryService', () => {
  it('seeds defaults once per install with deterministic ids', async () => {
    const t = await createTestServices();
    expect(await t.services.categories.seedDefaults()).toBe(DEFAULT_CATEGORIES.length);
    expect(await t.services.categories.seedDefaults()).toBe(0);
    const all = await t.services.categories.list();
    expect(all.map((c) => c.id)).toContain('seed:groceries');
    expect(await t.services.categories.list({ kind: 'income' })).toHaveLength(
      DEFAULT_CATEGORIES.filter((c) => c.kind === 'income').length,
    );
  });

  it('creates, edits, and archives categories', async () => {
    const t = await createTestServices();
    const pets = await t.services.categories.create({
      name: 'Pets',
      kind: 'expense',
      color: 'amber',
      icon: 'heart',
    });
    await t.services.categories.update(pets.id, {
      name: 'Pet care',
      kind: 'income',
      color: 'rose',
      icon: 'gift',
    });
    expect(await t.services.categories.get(pets.id)).toMatchObject({
      name: 'Pet care',
      kind: 'expense',
      color: 'rose',
    });
    await t.services.categories.setArchived(pets.id, true);
    expect(await t.services.categories.list()).toEqual([]);
  });

  it('deletes only categories that no transaction or recurring rule uses', async () => {
    const t = await createTestServices();
    await t.services.categories.seedDefaults();
    const account = await makeAccount(t, 'Main');
    await t.services.transactions.create({
      kind: 'expense',
      date: '2024-05-10',
      amount: '5',
      accountId: account.id,
      categoryId: 'seed:groceries',
    });
    await t.services.recurring.create({
      frequency: 'monthly',
      interval: 1,
      startDate: '2024-06-01',
      endDate: null,
      template: { kind: 'expense', amount: '1', accountId: account.id, categoryId: 'seed:travel' },
    });

    for (const id of ['seed:groceries', 'seed:travel']) {
      expect(await t.services.categories.isInUse(id)).toBe(true);
      await expect(t.services.categories.remove(id)).rejects.toBeInstanceOf(InUseError);
    }
    await expect(t.services.categories.remove('seed:travel')).rejects.toMatchObject({
      code: 'categoryInUse',
    });
    // A budget alone doesn't keep a category.
    await t.services.budgets.set({ categoryId: 'seed:dining', month: '2024-05', limit: '100' });
    expect(await t.services.categories.isInUse('seed:dining')).toBe(false);
    await t.services.categories.remove('seed:dining');
    await expect(t.services.categories.get('seed:dining')).rejects.toBeInstanceOf(NotFoundError);
    expect((await t.services.budgets.forMonth('2024-05')).lines).toEqual([]);
  });

  it('restores a deleted category that a transaction uses again', async () => {
    const t = await createTestServices();
    await t.services.categories.seedDefaults();
    const account = await makeAccount(t, 'Wallet');
    await t.services.categories.remove('seed:dining');
    expect(await t.services.categories.restoreUsed()).toBe(0);
    // As if another device had used the category before it learned about the delete.
    await t.repos.transactions.create({
      id: 'remote-tx',
      kind: 'expense',
      date: '2024-05-10',
      amountMinor: 100,
      accountId: account.id,
      toAccountId: null,
      categoryId: 'seed:dining',
      payee: '',
      note: '',
      recurringRuleId: null,
      createdAt: t.clock.nowIso(),
      updatedAt: t.clock.nowIso(),
      deleted: false,
    });
    expect(await t.services.categories.restoreUsed()).toBe(1);
    expect((await t.services.categories.get('seed:dining')).kind).toBe('expense');
    expect(await t.services.categories.restoreUsed()).toBe(0);
  });
});
