import { beforeEach, describe, expect, it } from 'vitest';
import { InUseError, NotFoundError } from '../../../src/core/errors.js';
import { asyncFieldErrors } from '../../helpers/fieldErrors.js';
import { createTestServices, makeAccount } from '../../helpers/testServices.js';

/** @typedef {import('../../../src/core/domain/toPay.js').ToPayInput} ToPayInput */

describe('ToPayService', () => {
  /** @type {Awaited<ReturnType<typeof createTestServices>>} */
  let t;
  /** @type {string} */
  let checking;

  beforeEach(async () => {
    // Today is 2024-05-15.
    t = await createTestServices();
    await t.services.categories.seedDefaults();
    checking = (await makeAccount(t, 'Checking', '1000')).id;
  });

  /**
   * @param {Partial<ToPayInput>} [over]
   * @returns {ToPayInput}
   */
  const rent = (over = {}) => ({
    kind: 'expense',
    amount: '800',
    accountId: checking,
    categoryId: 'seed:housing',
    payee: 'Landlord',
    note: 'June',
    dueDate: '2024-06-01',
    ...over,
  });

  it('creates and lists To pays, soonest due first and those without a due date last', async () => {
    await t.services.toPays.create(rent({ payee: 'Later', dueDate: '2024-07-01' }));
    await t.services.toPays.create(rent({ payee: 'Whenever', dueDate: '' }));
    await t.services.toPays.create(rent({ payee: 'Overdue', dueDate: '2024-05-01' }));
    expect((await t.services.toPays.list()).map((item) => item.payee)).toEqual([
      'Overdue',
      'Later',
      'Whenever',
    ]);
  });

  it('validates like a transaction', async () => {
    expect(
      await asyncFieldErrors(t.services.toPays.create(rent({ amount: '', accountId: 'nope' }))),
    ).toEqual({ amount: 'validation.money.empty', accountId: 'validation.required' });
  });

  it('edits only the fields that changed and nothing else', async () => {
    const made = await t.services.toPays.create(rent());
    t.clock.advance(60_000);
    await t.services.toPays.edit(made.id, rent({ amount: '850', dueDate: '' }));
    expect(await t.services.toPays.get(made.id)).toMatchObject({
      amountMinor: 85000,
      dueDate: null,
      payee: 'Landlord',
      updatedAt: t.clock.nowIso(),
    });
    expect((await t.services.transactions.query({ limit: 100 })).items).toEqual([]);
    // No change writes nothing.
    const before = await t.services.toPays.get(made.id);
    t.clock.advance(60_000);
    await t.services.toPays.edit(made.id, rent({ amount: '850', dueDate: '' }));
    expect(await t.services.toPays.get(made.id)).toEqual(before);
  });

  it('keeps the automation of an automatic To pay through edits', async () => {
    const made = await t.services.toPays.create(rent());
    await t.repos.toPays.update(made.id, { automationId: 'auto-1' });
    await t.services.toPays.edit(made.id, rent({ payee: 'New landlord' }));
    expect((await t.services.toPays.get(made.id)).automationId).toBe('auto-1');
  });

  it('pays: records the transaction dated today and deletes the To pay', async () => {
    const made = await t.services.toPays.create(rent());
    const payment = await t.services.toPays.pay(made.id);
    expect(payment).toMatchObject({ date: '2024-05-15', amountMinor: 80000, payee: 'Landlord' });
    expect(await t.services.transactions.get(payment.id)).toMatchObject({
      kind: 'expense',
      date: '2024-05-15',
      accountId: checking,
      categoryId: 'seed:housing',
      note: 'June',
      automationId: null,
    });
    expect(await t.services.toPays.list()).toEqual([]);
    expect((await t.services.accounts.listWithBalances())[0].balanceMinor).toBe(100000 - 80000);
    await expect(t.services.toPays.pay(made.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('deletes a To pay without recording anything', async () => {
    const made = await t.services.toPays.create(rent());
    await t.services.toPays.remove(made.id);
    expect(await t.services.toPays.list()).toEqual([]);
    expect((await t.services.transactions.query({ limit: 100 })).items).toEqual([]);
    await expect(t.services.toPays.remove(made.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('keeps accounts and categories a To pay uses from being deleted', async () => {
    const savings = await makeAccount(t, 'Savings');
    const made = await t.services.toPays.create(
      rent({ kind: 'transfer', toAccountId: savings.id, categoryId: null }),
    );
    await expect(t.services.accounts.remove(savings.id)).rejects.toBeInstanceOf(InUseError);
    const groceries = await t.services.toPays.create(rent({ categoryId: 'seed:groceries' }));
    await expect(t.services.categories.remove('seed:groceries')).rejects.toBeInstanceOf(InUseError);
    await t.services.toPays.remove(made.id);
    await t.services.toPays.remove(groceries.id);
    await t.services.accounts.remove(savings.id);
    await t.services.categories.remove('seed:groceries');
  });
});
