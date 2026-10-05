import { describe, expect, it } from 'vitest';
import { InUseError, NotFoundError } from '../../../src/core/errors.js';
import { createTestServices, makeAccount } from '../../helpers/testServices.js';
import { asyncFieldErrors } from '../../helpers/fieldErrors.js';

describe('AccountService', () => {
  it('creates, updates, and archives accounts', async () => {
    const t = await createTestServices();
    const account = await makeAccount(t, 'Main', '100');
    expect(account.openingBalanceMinor).toBe(10_000);
    t.clock.advance(1000);
    await t.services.accounts.update(account.id, {
      name: 'Main account',
      type: 'savings',
      currency: 'USD',
      openingBalance: '50,5',
    });
    const updated = await t.services.accounts.get(account.id);
    expect(updated).toMatchObject({
      name: 'Main account',
      type: 'savings',
      currency: 'EUR',
      openingBalanceMinor: 5050,
    });
    expect(updated.updatedAt > updated.createdAt).toBe(true);
    await t.services.accounts.setArchived(account.id, true);
    expect(await t.services.accounts.list()).toEqual([]);
    expect(await t.services.accounts.list({ includeArchived: true })).toHaveLength(1);
  });

  it('validates input and reports missing accounts', async () => {
    const t = await createTestServices();
    expect(
      await asyncFieldErrors(
        t.services.accounts.create({
          name: '',
          type: 'cash',
          currency: 'EUR',
          openingBalance: '0',
        }),
      ),
    ).toEqual({ name: 'validation.required' });
    await expect(t.services.accounts.get('nope')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('deletes only accounts that no transaction or recurring rule uses', async () => {
    const t = await createTestServices();
    await t.services.categories.seedDefaults();
    const unused = await makeAccount(t, 'Unused');
    const used = await makeAccount(t, 'Used');
    const scheduled = await makeAccount(t, 'Scheduled');
    const target = await makeAccount(t, 'Transfer target');
    await t.services.transactions.create({
      kind: 'transfer',
      date: '2024-05-01',
      amount: '5',
      accountId: used.id,
      toAccountId: target.id,
    });
    await t.services.recurring.create({
      frequency: 'monthly',
      interval: 1,
      startDate: '2024-06-01',
      endDate: null,
      template: { kind: 'expense', amount: '1', accountId: scheduled.id, categoryId: null },
    });

    for (const account of [used, target, scheduled]) {
      expect(await t.services.accounts.isInUse(account.id)).toBe(true);
      await expect(t.services.accounts.remove(account.id)).rejects.toBeInstanceOf(InUseError);
    }
    await expect(t.services.accounts.remove(used.id)).rejects.toMatchObject({
      code: 'accountInUse',
    });
    await t.services.accounts.remove(unused.id);
    expect((await t.services.accounts.list()).map((a) => a.name)).toEqual([
      'Scheduled',
      'Transfer target',
      'Used',
    ]);
    await expect(t.services.accounts.get(unused.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('restores a deleted account that a transaction uses again', async () => {
    const t = await createTestServices();
    await t.services.categories.seedDefaults();
    const account = await makeAccount(t, 'Wallet');
    await t.services.accounts.remove(account.id);
    expect(await t.services.accounts.restoreUsed()).toBe(0);
    // As if another device had used the account before it learned about the delete.
    await t.repos.transactions.create({
      id: 'remote-tx',
      kind: 'expense',
      date: '2024-05-10',
      amountMinor: 100,
      accountId: account.id,
      toAccountId: null,
      categoryId: null,
      payee: '',
      note: '',
      recurringRuleId: null,
      createdAt: t.clock.nowIso(),
      updatedAt: t.clock.nowIso(),
      deleted: false,
    });
    expect(await t.services.accounts.restoreUsed()).toBe(1);
    expect((await t.services.accounts.get(account.id)).name).toBe('Wallet');
    expect(await t.services.accounts.restoreUsed()).toBe(0);
  });

  it('derives balances from the opening balance and transactions', async () => {
    const t = await createTestServices();
    await t.services.categories.seedDefaults();
    const main = await makeAccount(t, 'Main', '100');
    const cash = await makeAccount(t, 'Cash', '0');
    const tx = t.services.transactions;
    await tx.create({
      kind: 'income',
      date: '2024-05-01',
      amount: '1000',
      accountId: main.id,
      categoryId: 'seed:salary',
    });
    await tx.create({
      kind: 'expense',
      date: '2024-05-02',
      amount: '25.50',
      accountId: main.id,
      categoryId: 'seed:groceries',
    });
    await tx.create({
      kind: 'transfer',
      date: '2024-05-03',
      amount: '40',
      accountId: main.id,
      toAccountId: cash.id,
    });
    const balances = await t.services.accounts.listWithBalances();
    const byName = Object.fromEntries(balances.map((b) => [b.account.name, b.balanceMinor]));
    expect(byName).toEqual({ Main: 10_000 + 100_000 - 2_550 - 4_000, Cash: 4_000 });
  });

  it('reconciles with the counted balance through today, recording the difference', async () => {
    const t = await createTestServices();
    const main = await makeAccount(t, 'Main', '100');
    const tx = t.services.transactions;
    await tx.create({ kind: 'expense', date: '2024-05-10', amount: '20', accountId: main.id });
    // Dated tomorrow: it hasn't happened yet, so it doesn't count when reconciling today.
    await tx.create({ kind: 'expense', date: '2024-05-16', amount: '5', accountId: main.id });
    expect(await t.services.accounts.balanceToday(main.id)).toBe(8_000);

    expect(await t.services.accounts.reconcile(main.id, { balance: '75.50' })).toEqual({
      differenceMinor: -450,
    });
    const { items } = await tx.query({ limit: 10, accountId: main.id });
    expect(items.find((i) => i.adjustment)).toMatchObject({
      kind: 'expense',
      date: '2024-05-15',
      amountMinor: 450,
      categoryId: null,
      adjustment: true,
    });
    expect(await t.services.accounts.balanceToday(main.id)).toBe(7_550);

    expect(await t.services.accounts.reconcile(main.id, { balance: '75,5' })).toEqual({
      differenceMinor: 0,
    });
    expect((await tx.query({ limit: 10, accountId: main.id })).items).toHaveLength(3);

    expect(await t.services.accounts.reconcile(main.id, { balance: '-10' })).toEqual({
      differenceMinor: -8_550,
    });
  });

  it('rejects an invalid counted balance and unknown accounts when reconciling', async () => {
    const t = await createTestServices();
    const main = await makeAccount(t, 'Main');
    expect(
      await asyncFieldErrors(t.services.accounts.reconcile(main.id, { balance: 'x' })),
    ).toEqual({ balance: 'validation.money.invalid' });
    await expect(t.services.accounts.reconcile('nope', { balance: '1' })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
