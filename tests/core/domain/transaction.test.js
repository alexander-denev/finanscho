import { describe, expect, it } from 'vitest';
import {
  balanceEffect,
  compareTransactionsNewestFirst,
  createBalanceAdjustment,
  createTransaction,
  normalizeTransactionInput,
} from '../../../src/core/domain/transaction.js';
import { fieldErrors } from '../../helpers/fieldErrors.js';

/** @typedef {import('../../../src/core/domain/transaction.js').Transaction} Transaction */

const ctx = { id: 'id-1', now: '2024-05-01T10:00:00.000Z' };
const eur = { currency: 'EUR' };
const refs = {
  account: eur,
  toAccount: null,
  category: /** @type {{ kind: 'expense' }} */ ({ kind: 'expense' }),
};

describe('transaction', () => {
  it('normalizes an expense', () => {
    const fields = normalizeTransactionInput(
      {
        kind: 'expense',
        date: '2024-05-02',
        amount: '12,30',
        accountId: 'a1',
        categoryId: 'c1',
        payee: ' Shop ',
        note: '',
      },
      refs,
    );
    expect(fields).toEqual({
      kind: 'expense',
      date: '2024-05-02',
      amountMinor: 1230,
      accountId: 'a1',
      toAccountId: null,
      categoryId: 'c1',
      payee: 'Shop',
      note: '',
    });
    const tx = createTransaction(fields, ctx);
    expect(tx.automationId).toBeNull();
    expect(tx.createdAt).toBe(ctx.now);
  });

  it('rejects zero amounts, bad dates, and mismatched category kinds', () => {
    expect(
      fieldErrors(() =>
        normalizeTransactionInput(
          { kind: 'income', date: '2024-02-30', amount: '0', accountId: 'a1', categoryId: 'c1' },
          refs,
        ),
      ),
    ).toEqual({
      date: 'validation.date',
      amount: 'validation.money.zero',
      categoryId: 'validation.categoryKind',
    });
  });

  it('requires an existing account and, when one is given, an existing category', () => {
    expect(
      fieldErrors(() =>
        normalizeTransactionInput(
          { kind: 'expense', date: '2024-02-03', amount: '1', accountId: 'x', categoryId: 'gone' },
          { account: null, toAccount: null, category: null },
        ),
      ),
    ).toEqual({ accountId: 'validation.required', categoryId: 'validation.required' });
  });

  it('allows income and expenses without a category', () => {
    for (const categoryId of ['', null, undefined]) {
      const fields = normalizeTransactionInput(
        { kind: 'expense', date: '2024-02-03', amount: '1', accountId: 'a1', categoryId },
        { account: eur, toAccount: null, category: null },
      );
      expect(fields.categoryId).toBeNull();
    }
  });

  it('validates transfers', () => {
    const base = { kind: 'transfer', date: '2024-05-02', amount: '5', accountId: 'a1' };
    expect(
      fieldErrors(() =>
        normalizeTransactionInput(
          { ...base, toAccountId: 'a1' },
          { account: eur, toAccount: eur, category: null },
        ),
      ),
    ).toEqual({ toAccountId: 'validation.sameAccount' });
    expect(
      fieldErrors(() =>
        normalizeTransactionInput(
          { ...base, toAccountId: 'a2' },
          { account: eur, toAccount: { currency: 'USD' }, category: null },
        ),
      ),
    ).toEqual({ toAccountId: 'validation.currencyMismatch' });
    const ok = normalizeTransactionInput(
      { ...base, toAccountId: 'a2', categoryId: 'ignored' },
      { account: eur, toAccount: eur, category: null },
    );
    expect(ok.categoryId).toBeNull();
    expect(ok.toAccountId).toBe('a2');
  });

  it('computes balance effects with signs from kind', () => {
    /** @type {Pick<Transaction, 'kind' | 'amountMinor' | 'accountId' | 'toAccountId'>} */
    const income = { kind: 'income', amountMinor: 100, accountId: 'a', toAccountId: null };
    expect(balanceEffect(income, 'a')).toBe(100);
    expect(balanceEffect({ ...income, kind: 'expense' }, 'a')).toBe(-100);
    const transfer = { ...income, kind: /** @type {const} */ ('transfer'), toAccountId: 'b' };
    expect(balanceEffect(transfer, 'a')).toBe(-100);
    expect(balanceEffect(transfer, 'b')).toBe(100);
    expect(balanceEffect(income, 'b')).toBe(0);
  });

  it('sorts newest first', () => {
    /**
     * @param {string} id
     * @param {string} date
     * @param {string} createdAt
     * @returns {Transaction}
     */
    const t = (id, date, createdAt) => /** @type {Transaction} */ ({ id, date, createdAt });
    const sorted = [
      t('a', '2024-01-01', 'x1'),
      t('b', '2024-01-02', 'x0'),
      t('c', '2024-01-01', 'x2'),
    ].sort(compareTransactionsNewestFirst);
    expect(sorted.map((x) => x.id)).toEqual(['b', 'c', 'a']);
  });

  it('builds a balance adjustment for the difference to the counted balance', () => {
    const base = { accountId: 'a1', currency: 'EUR', bookMinor: 10_000, date: '2024-05-15' };
    expect(createBalanceAdjustment({ ...base, actual: '120,50' }, ctx)).toEqual({
      id: 'id-1',
      kind: 'income',
      date: '2024-05-15',
      amountMinor: 2_050,
      accountId: 'a1',
      toAccountId: null,
      categoryId: null,
      payee: '',
      note: '',
      automationId: null,
      adjustment: true,
      createdAt: ctx.now,
      updatedAt: ctx.now,
      deleted: false,
    });
    expect(createBalanceAdjustment({ ...base, actual: '-30' }, ctx)).toMatchObject({
      kind: 'expense',
      amountMinor: 13_000,
      adjustment: true,
    });
    expect(createBalanceAdjustment({ ...base, actual: '100.00' }, ctx)).toBeNull();
  });

  it('rejects an invalid counted balance', () => {
    const base = { accountId: 'a1', currency: 'EUR', bookMinor: 0, date: '2024-05-15' };
    expect(fieldErrors(() => createBalanceAdjustment({ ...base, actual: '' }, ctx))).toEqual({
      balance: 'validation.money.empty',
    });
    expect(fieldErrors(() => createBalanceAdjustment({ ...base, actual: '1.234' }, ctx))).toEqual({
      balance: 'validation.money.tooManyDecimals',
    });
  });
});
