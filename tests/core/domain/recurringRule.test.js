import { describe, expect, it } from 'vitest';
import {
  buildOccurrence,
  createRecurringRule,
  endDateForEdit,
  normalizeRuleInput,
  occurrenceId,
} from '../../../src/core/domain/recurringRule.js';
import { fieldErrors } from '../../helpers/fieldErrors.js';

const ctx = { id: 'id-1', now: '2024-05-01T10:00:00.000Z' };
const refs = {
  account: { currency: 'EUR' },
  toAccount: null,
  category: /** @type {{ kind: 'expense' }} */ ({ kind: 'expense' }),
};
const input = {
  frequency: 'monthly',
  interval: '1',
  startDate: '2024-01-31',
  endDate: '',
  template: {
    kind: 'expense',
    amount: '9.99',
    accountId: 'a1',
    categoryId: 'c1',
    payee: 'Stream',
  },
};

describe('recurring rule', () => {
  it('normalizes rule input', () => {
    expect(normalizeRuleInput(input, refs)).toEqual({
      frequency: 'monthly',
      interval: 1,
      startDate: '2024-01-31',
      endDate: null,
      template: {
        kind: 'expense',
        amountMinor: 999,
        accountId: 'a1',
        toAccountId: null,
        categoryId: 'c1',
        payee: 'Stream',
        note: '',
      },
    });
  });

  it('merges schedule and template errors', () => {
    expect(
      fieldErrors(() =>
        normalizeRuleInput(
          {
            ...input,
            frequency: 'hourly',
            interval: 0,
            endDate: '2023-01-01',
            template: { ...input.template, amount: '' },
          },
          refs,
        ),
      ),
    ).toEqual({
      frequency: 'validation.required',
      interval: 'validation.interval',
      endDate: 'validation.endBeforeStart',
      amount: 'validation.money.empty',
    });
  });

  it('builds byte-identical occurrences from the rule', () => {
    const rule = createRecurringRule(normalizeRuleInput(input, refs), ctx);
    const a = buildOccurrence(rule, '2024-02-29');
    const b = buildOccurrence(rule, '2024-02-29');
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a).toMatchObject({
      id: occurrenceId('id-1', '2024-02-29'),
      date: '2024-02-29',
      amountMinor: 999,
      recurringRuleId: 'id-1',
      createdAt: ctx.now,
      updatedAt: ctx.now,
    });
  });

  it('ends a rule the day before an edit takes effect', () => {
    const rule = createRecurringRule(normalizeRuleInput(input, refs), ctx);
    expect(endDateForEdit(rule, '2024-06-01')).toBe('2024-05-31');
    expect(endDateForEdit({ ...rule, endDate: '2024-03-01' }, '2024-06-01')).toBe('2024-03-01');
  });
});
