import { describe, expect, it } from 'vitest';
import { NotFoundError } from '../../../src/core/errors.js';
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
});
