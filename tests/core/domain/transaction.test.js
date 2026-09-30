import { describe, expect, it } from 'vitest';
import {
  balanceEffect,
  compareTransactionsNewestFirst,
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
    expect(tx.recurringRuleId).toBeNull();
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

  it('requires an existing account and category', () => {
    expect(
      fieldErrors(() =>
        normalizeTransactionInput(
          { kind: 'expense', date: '2024-02-03', amount: '1', accountId: 'x', categoryId: '' },
          { account: null, toAccount: null, category: null },
        ),
      ),
    ).toEqual({ accountId: 'validation.required', categoryId: 'validation.required' });
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
});
