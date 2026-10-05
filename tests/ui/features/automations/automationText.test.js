import { describe, expect, it } from 'vitest';
import {
  actionDraft,
  conditionDraft,
  groupDraft,
} from '../../../../src/ui/features/automations/automationDraft.js';
import {
  describeAction,
  describeCondition,
  describeGroup,
  describeTrigger,
} from '../../../../src/ui/features/automations/automationText.js';

const names = {
  /** @param {string} id */
  account: (id) => ({ c: 'Checking', s: 'Savings' })[id] ?? '?',
  /** @param {string} id */
  category: (id) => ({ g: 'Groceries' })[id] ?? '?',
  currencyOf: () => 'EUR',
};
const defaults = { accountId: 'c', currency: 'EUR' };

describe('automation text', () => {
  it('describes schedules like a calendar', () => {
    /** @param {object} trigger */
    const line = (trigger) => describeTrigger({ type: 'schedule', every: 1, ...trigger });
    expect(line({ unit: 'day' })).toBe('Every day');
    expect(line({ unit: 'day', every: 2 })).toBe('Every 2 days');
    expect(line({ unit: 'week', weekdays: [1, 2] })).toBe('Every week on Mon, Tue');
    expect(line({ unit: 'week', weekdays: [1, 2, 3, 4, 5, 6, 7] })).toBe('Every day');
    expect(line({ unit: 'week', every: 2, weekdays: [5] })).toBe('Every 2 weeks on Fri');
    expect(line({ unit: 'month', monthDay: { kind: 'day', day: 1 } })).toBe('Every month on day 1');
    expect(line({ unit: 'month', monthDay: { kind: 'day', day: 31 }, weekend: 'before' })).toBe(
      'Every month on the last day, Friday before weekends',
    );
    expect(line({ unit: 'month', monthDay: { kind: 'weekday', nth: -1, weekday: 5 } })).toBe(
      'Every month on the last Friday',
    );
    expect(line({ unit: 'month', every: 3, monthDay: { kind: 'day', day: 15 } })).toBe(
      'Every 3 months on day 15',
    );
    expect(line({ unit: 'year', month: 1, day: 1 })).toBe('Every year on January 1');
    expect(describeTrigger({ type: 'transactionRecorded' })).toBe('When a transaction is recorded');
  });

  it('describes checks and groups', () => {
    const kind = { ...conditionDraft('kind', defaults), kind: 'income' };
    const account = { ...conditionDraft('account', defaults), accountId: 'c' };
    const payee = { ...conditionDraft('payee', defaults), text: 'ACME' };
    const amount = { ...conditionDraft('amount', defaults), amount: '1000' };
    expect(describeCondition(kind, names)).toBe('Type is Income');
    expect(describeCondition(account, names)).toBe('Account is Checking');
    expect(describeCondition(payee, names)).toBe('Payee contains “ACME”');
    expect(describeGroup({ ...groupDraft(), items: [payee, amount] }, names)).toBe(
      'Any of: Payee contains “ACME”, Amount is at least €1,000.00',
    );
    expect(describeGroup(groupDraft(), names)).toBe('Empty group');
  });

  it('describes steps', () => {
    expect(
      describeAction(
        { ...actionDraft('createTransaction', defaults), amount: '800', note: 'Rent {month}' },
        names,
      ),
    ).toBe('Expense €800.00 · Checking · Rent {month}');
    expect(
      describeAction(
        {
          ...actionDraft('createTransaction', defaults),
          kind: 'transfer',
          toAccountId: 's',
          amountType: 'percent',
          amount: '10',
        },
        names,
      ),
    ).toBe('Transfer 10% · Checking → Savings');
    expect(
      describeAction(
        { ...actionDraft('setBudget', defaults), budgetCategoryId: 'g', amount: '300' },
        names,
      ),
    ).toBe('Set Groceries budget to €300.00');
  });
});
