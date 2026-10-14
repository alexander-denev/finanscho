import { describe, expect, it } from 'vitest';
import {
  compareToPays,
  createToPay,
  daysLeft,
  dueTone,
  normalizeToPayInput,
  paymentFor,
  toPayEdits,
  toPayPaymentId,
} from '../../../src/core/domain/toPay.js';
import { fieldErrors } from '../../helpers/fieldErrors.js';

/** @typedef {import('../../../src/core/domain/toPay.js').ToPay} ToPay */

const ctx = { id: 'tp-1', now: '2024-05-01T10:00:00.000Z' };
const refs = {
  account: { currency: 'EUR' },
  toAccount: null,
  category: /** @type {{ kind: 'expense' }} */ ({ kind: 'expense' }),
};
const rentInput = {
  kind: 'expense',
  amount: '800',
  accountId: 'a1',
  categoryId: 'c1',
  payee: ' Rent ',
  note: '',
  dueDate: '2024-06-01',
};

/**
 * @param {Partial<ToPay>} [over]
 * @returns {ToPay}
 */
function toPay(over = {}) {
  return { ...createToPay(normalizeToPayInput(rentInput, refs), ctx), ...over };
}

describe('toPay', () => {
  it('normalizes input like a transaction without a date', () => {
    const fields = normalizeToPayInput(rentInput, refs);
    expect(fields).toEqual({
      kind: 'expense',
      amountMinor: 80000,
      accountId: 'a1',
      toAccountId: null,
      categoryId: 'c1',
      payee: 'Rent',
      note: '',
      dueDate: '2024-06-01',
    });
    const made = createToPay(fields, ctx);
    expect(made).toMatchObject({ id: 'tp-1', automationId: null, deleted: false });
    expect(createToPay(fields, ctx, 'auto-1').automationId).toBe('auto-1');
  });

  it('makes the due date optional', () => {
    expect(normalizeToPayInput({ ...rentInput, dueDate: '' }, refs).dueDate).toBeNull();
    expect(normalizeToPayInput({ ...rentInput, dueDate: null }, refs).dueDate).toBeNull();
    expect(normalizeToPayInput({ ...rentInput, dueDate: undefined }, refs).dueDate).toBeNull();
  });

  it('reports transaction and due date errors together', () => {
    expect(
      fieldErrors(() =>
        normalizeToPayInput(
          { ...rentInput, amount: '0', accountId: '', dueDate: '2024-02-30' },
          {
            ...refs,
            account: null,
          },
        ),
      ),
    ).toEqual({
      amount: 'validation.money.zero',
      accountId: 'validation.required',
      dueDate: 'validation.date',
    });
  });

  it('lists only the fields an edit changes', () => {
    const current = toPay();
    const fields = normalizeToPayInput({ ...rentInput, amount: '850', dueDate: '' }, refs);
    expect(toPayEdits(current, fields)).toEqual({ amountMinor: 85000, dueDate: null });
    expect(toPayEdits(current, normalizeToPayInput(rentInput, refs))).toEqual({});
  });

  it('pays with the transaction it holds, dated today, as the user', () => {
    const made = toPay({ automationId: 'auto-1' });
    const now = '2024-06-03T08:00:00.000Z';
    expect(paymentFor(made, '2024-06-03', now)).toEqual({
      id: 'paid:tp-1',
      kind: 'expense',
      date: '2024-06-03',
      amountMinor: 80000,
      accountId: 'a1',
      toAccountId: null,
      categoryId: 'c1',
      payee: 'Rent',
      note: '',
      automationId: null,
      createdAt: now,
      updatedAt: now,
      deleted: false,
    });
    expect(toPayPaymentId('auto-1:t0:a0:2024-06-01')).toBe('paid:auto-1:t0:a0:2024-06-01');
  });

  it('counts the days left and picks the warning', () => {
    expect(daysLeft(null, '2024-05-15')).toBeNull();
    expect(daysLeft('2024-05-20', '2024-05-15')).toBe(5);
    expect(daysLeft('2024-05-13', '2024-05-15')).toBe(-2);
    expect(dueTone(null, '2024-05-15')).toBe('none');
    expect(dueTone('2024-05-16', '2024-05-15')).toBe('ahead');
    expect(dueTone('2024-05-15', '2024-05-15')).toBe('today');
    expect(dueTone('2024-05-14', '2024-05-15')).toBe('overdue');
  });

  it('sorts by due date, then those without one, then by payee', () => {
    const items = [
      toPay({ id: 'n', payee: 'B', dueDate: null }),
      toPay({ id: 'l', payee: 'Late', dueDate: '2024-06-10' }),
      toPay({ id: 'm', payee: 'A', dueDate: null }),
      toPay({ id: 'e', payee: 'Early', dueDate: '2024-05-01' }),
    ];
    expect(items.sort(compareToPays).map((item) => item.id)).toEqual(['e', 'l', 'm', 'n']);
  });
});
