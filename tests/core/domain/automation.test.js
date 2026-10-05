import { describe, expect, it } from 'vitest';
import {
  buildEventResults,
  buildRunNowResults,
  buildScheduledResults,
  canRunNow,
  canTrigger,
  createAutomation,
  eventResultId,
  fillWords,
  matches,
  nextDate,
  normalizeAutomationInput,
  parsePercent,
  referencedIds,
  resolveAmount,
  scheduleDates,
  scheduledResultId,
  shiftForWeekend,
  unknownWords,
} from '../../../src/core/domain/automation.js';
import { fieldErrors } from '../../helpers/fieldErrors.js';

/** @typedef {import('../../../src/core/domain/automation.js').Automation} Automation */
/** @typedef {import('../../../src/core/domain/automation.js').AutomationInput} AutomationInput */
/** @typedef {import('../../../src/core/domain/automation.js').ScheduleTrigger} ScheduleTrigger */
/** @typedef {import('../../../src/core/domain/transaction.js').Transaction} Transaction */

const refs = {
  accounts: new Map([
    ['checking', { currency: 'EUR' }],
    ['savings', { currency: 'EUR' }],
    ['dollars', { currency: 'USD' }],
  ]),
  /** @type {Map<string, { kind: 'income' | 'expense' }>} */
  categories: new Map([
    ['rent', { kind: 'expense' }],
    ['salary', { kind: 'income' }],
  ]),
  defaultCurrency: 'EUR',
};

/**
 * @param {import('../../../src/core/domain/automation.js').AutomationResult} result
 * @returns {string} the transaction's date or the budget's month
 */
const dateOf = (result) =>
  result.entity === 'transactions' ? result.record.date : result.record.month;

/** @param {string} accountId */
const currencyOf = (accountId) => refs.accounts.get(accountId)?.currency ?? null;

/**
 * @param {Partial<AutomationInput>} [over]
 * @returns {AutomationInput}
 */
const rentInput = (over = {}) => ({
  name: 'Rent',
  startDate: '2026-01-01',
  endDate: null,
  triggers: [{ type: 'schedule', every: 1, unit: 'month', monthDay: { kind: 'day', day: 1 } }],
  conditions: null,
  actions: [
    {
      type: 'createTransaction',
      template: {
        kind: 'expense',
        accountId: 'checking',
        categoryId: 'rent',
        payee: 'Landlord',
        note: 'Rent {month}',
      },
      amount: { type: 'fixed', value: '800' },
    },
  ],
  ...over,
});

/**
 * @param {Partial<AutomationInput>} [over]
 * @returns {AutomationInput}
 */
const saveInput = (over = {}) => ({
  name: 'Save from salary',
  startDate: '2026-10-01',
  triggers: [{ type: 'transactionRecorded' }],
  conditions: {
    match: 'all',
    items: [
      { field: 'kind', op: 'is', kind: 'income' },
      { field: 'account', op: 'is', accountId: 'checking' },
    ],
  },
  actions: [
    {
      type: 'createTransaction',
      template: {
        kind: 'transfer',
        accountId: 'checking',
        toAccountId: 'savings',
        payee: '',
        note: '10% of {payee}',
      },
      amount: { type: 'percent', value: '10' },
    },
  ],
  ...over,
});

/**
 * @param {AutomationInput} input
 * @param {string} [id]
 * @returns {Automation}
 */
const build = (input, id = 'auto') =>
  createAutomation(normalizeAutomationInput(input, refs), { id, now: '2026-01-01T00:00:00.000Z' });

/**
 * @param {Partial<Transaction>} over
 * @returns {Transaction}
 */
const tx = (over) => ({
  id: 'tx-1',
  kind: 'income',
  date: '2026-10-05',
  amountMinor: 250_000,
  accountId: 'checking',
  toAccountId: null,
  categoryId: 'salary',
  payee: 'ACME',
  note: '',
  automationId: null,
  createdAt: '2026-10-05T08:00:00.000Z',
  updatedAt: '2026-10-05T08:00:00.000Z',
  deleted: false,
  ...over,
});

/**
 * @param {Partial<import('../../../src/core/domain/automation.js').RunContext>} [over]
 * @returns {import('../../../src/core/domain/automation.js').RunContext}
 */
const run = (over = {}) => ({
  today: '2026-10-05',
  existingIds: new Set(),
  existingBudgetIds: new Set(),
  currencyOf,
  ...over,
});

/**
 * @param {Partial<ScheduleTrigger>} over
 * @returns {ScheduleTrigger}
 */
const schedule = (over) => ({
  type: 'schedule',
  every: 1,
  unit: 'month',
  phase: 0,
  monthDay: { kind: 'day', day: 1 },
  weekend: 'keep',
  ...over,
});

describe('automation input', () => {
  it('normalizes a schedule automation', () => {
    expect(normalizeAutomationInput(rentInput(), refs)).toEqual({
      name: 'Rent',
      startDate: '2026-01-01',
      endDate: null,
      triggers: [
        {
          type: 'schedule',
          every: 1,
          unit: 'month',
          phase: 0,
          monthDay: { kind: 'day', day: 1 },
          weekend: 'keep',
        },
      ],
      conditions: null,
      actions: [
        {
          type: 'createTransaction',
          template: {
            kind: 'expense',
            accountId: 'checking',
            toAccountId: null,
            categoryId: 'rent',
            payee: 'Landlord',
            note: 'Rent {month}',
          },
          amount: { type: 'fixed', amountMinor: 80_000 },
        },
      ],
    });
  });

  it('normalizes a recorded-transaction automation with a percentage and nested groups', () => {
    const fields = normalizeAutomationInput(
      saveInput({
        conditions: {
          match: 'all',
          items: [
            { field: 'kind', op: 'is', kind: 'income' },
            {
              match: 'any',
              items: [
                { field: 'payee', op: 'contains', text: ' ACME ' },
                { field: 'amount', op: 'atLeast', amount: '1000' },
              ],
            },
          ],
        },
      }),
      refs,
    );
    expect(fields.actions[0].amount).toEqual({ type: 'percent', basisPoints: 1000 });
    expect(fields.conditions).toEqual({
      match: 'all',
      items: [
        { field: 'kind', op: 'is', kind: 'income' },
        {
          match: 'any',
          items: [
            { field: 'payee', op: 'contains', text: 'ACME' },
            { field: 'amount', op: 'atLeast', amountMinor: 100_000, currency: 'EUR' },
          ],
        },
      ],
    });
  });

  it('stores the currency of a Set budget step when it is saved', () => {
    const fields = normalizeAutomationInput(
      rentInput({
        actions: [{ type: 'setBudget', categoryId: 'rent', amount: { type: 'fixed', value: '0' } }],
      }),
      { ...refs, defaultCurrency: 'USD' },
    );
    expect(fields.actions).toEqual([
      {
        type: 'setBudget',
        categoryId: 'rent',
        currency: 'USD',
        amount: { type: 'fixed', amountMinor: 0 },
      },
    ]);
  });

  it('rejects combinations that cannot work', () => {
    expect(
      fieldErrors(() =>
        normalizeAutomationInput(
          rentInput({
            name: ' ',
            endDate: '2025-12-31',
            triggers: [
              { type: 'schedule', every: '0', unit: 'week', weekdays: [] },
              {
                type: 'schedule',
                every: 2,
                unit: 'month',
                phase: 2,
                monthDay: { kind: 'day', day: 32 },
              },
              { type: 'schedule', every: 1, unit: 'year', month: 4, day: 31 },
              { type: 'transactionRecorded' },
              { type: 'transactionRecorded' },
            ],
          }),
          refs,
        ),
      ),
    ).toEqual({
      name: 'validation.required',
      endDate: 'validation.endBeforeStart',
      triggers: 'validation.oneEventTrigger',
      'triggers.0.every': 'validation.every',
      'triggers.0.weekdays': 'validation.weekdays',
      'triggers.1.phase': 'validation.invalid',
      'triggers.1.day': 'validation.dayOfMonth',
      'triggers.2.day': 'validation.dayOfMonth',
    });
  });

  it('allows a percentage only when every trigger is a recorded transaction', () => {
    const percent = saveInput().actions;
    expect(
      fieldErrors(() => normalizeAutomationInput(rentInput({ actions: percent }), refs)),
    ).toEqual({
      'actions.0.amount': 'validation.percentNeedsEvent',
    });
  });

  it('allows If checks only with a recorded-transaction trigger, and no empty groups', () => {
    expect(
      fieldErrors(() =>
        normalizeAutomationInput(
          rentInput({ conditions: { match: 'all', items: [{ match: 'any', items: [] }] } }),
          refs,
        ),
      ),
    ).toEqual({
      conditions: 'validation.conditionsNeedEvent',
      'conditions.0': 'validation.emptyGroup',
    });
  });

  it('rejects unknown fill-in words and a missing account', () => {
    const input = rentInput();
    const action = /** @type {any} */ (input.actions[0]);
    action.template = { ...action.template, accountId: 'gone', note: 'Rent {mnth}' };
    expect(fieldErrors(() => normalizeAutomationInput(input, refs))).toEqual({
      'actions.0.accountId': 'validation.required',
      'actions.0.note': 'validation.unknownWord',
    });
  });

  it('parses percentages into basis points', () => {
    expect(['10', '12.5', '0,25', '100', '7 %'].map(parsePercent)).toEqual([
      1000, 1250, 25, 10_000, 700,
    ]);
    expect(['0', '100.01', '-5', 'ten', '1.234'].map(parsePercent)).toEqual([
      null,
      null,
      null,
      null,
      null,
    ]);
  });

  it('keeps the weekend rule only where a date can fall on a weekend', () => {
    const fields = normalizeAutomationInput(
      rentInput({
        triggers: [
          { type: 'schedule', every: 1, unit: 'week', weekdays: [5, '1', 5], weekend: 'before' },
          {
            type: 'schedule',
            every: 1,
            unit: 'month',
            monthDay: { kind: 'weekday', nth: '-1', weekday: '5' },
            weekend: 'after',
          },
          { type: 'schedule', every: 1, unit: 'year', month: '2', day: '29', weekend: 'after' },
        ],
      }),
      refs,
    );
    expect(fields.triggers).toEqual([
      { type: 'schedule', every: 1, unit: 'week', phase: 0, weekdays: [1, 5], weekend: 'keep' },
      {
        type: 'schedule',
        every: 1,
        unit: 'month',
        phase: 0,
        monthDay: { kind: 'weekday', nth: -1, weekday: 5 },
        weekend: 'keep',
      },
      { type: 'schedule', every: 1, unit: 'year', phase: 0, month: 2, day: 29, weekend: 'after' },
    ]);
  });

  it('lists unknown fill-in words', () => {
    expect(unknownWords('Rent {month} {Year} {payee} {x}')).toEqual(['Year', 'x']);
  });
});

describe('automation schedules', () => {
  it('moves weekend dates to the Friday before or the Monday after', () => {
    // 2026-08-01 is a Saturday, 2026-11-01 a Sunday.
    expect(shiftForWeekend('2026-08-01', 'before')).toBe('2026-07-31');
    expect(shiftForWeekend('2026-11-01', 'before')).toBe('2026-10-30');
    expect(shiftForWeekend('2026-08-01', 'after')).toBe('2026-08-03');
    expect(shiftForWeekend('2026-11-01', 'after')).toBe('2026-11-02');
    expect(shiftForWeekend('2026-11-01', 'keep')).toBe('2026-11-01');
    expect(shiftForWeekend('2026-10-05', 'before')).toBe('2026-10-05');
  });

  it('lands on the last day of each month for day 31', () => {
    const dates = scheduleDates(
      schedule({ monthDay: { kind: 'day', day: 31 } }),
      '2023-11-01',
      '2024-03-31',
    );
    expect(dates.map((d) => d.planned)).toEqual([
      '2023-11-30',
      '2023-12-31',
      '2024-01-31',
      '2024-02-29',
      '2024-03-31',
    ]);
  });

  it('makes a moved-back weekend date on the Friday before, with the planned month in its words', () => {
    // Planned Sunday 2026-11-01, moved to Friday 2026-10-30; "today" is that Friday.
    const automation = build(
      rentInput({
        startDate: '2026-10-01',
        triggers: [
          {
            type: 'schedule',
            every: 1,
            unit: 'month',
            monthDay: { kind: 'day', day: 1 },
            weekend: 'before',
          },
        ],
      }),
    );
    const results = buildScheduledResults(automation, run({ today: '2026-10-30' }));
    expect(results.map((r) => [r.record.id, dateOf(r)])).toEqual([
      [scheduledResultId('auto', 0, 0, '2026-10-01'), '2026-10-01'],
      [scheduledResultId('auto', 0, 0, '2026-11-01'), '2026-10-30'],
    ]);
    expect(/** @type {Transaction} */ (results[1].record).note).toBe('Rent November');
  });

  it('skips results that already exist and stops at the end date and the cap', () => {
    const automation = build(rentInput({ endDate: '2026-04-15' }));
    const existing = new Set([scheduledResultId('auto', 0, 0, '2026-02-01')]);
    const results = buildScheduledResults(automation, run({ existingIds: existing }));
    expect(results.map(dateOf)).toEqual(['2026-01-01', '2026-03-01', '2026-04-01']);
    expect(buildScheduledResults(build(rentInput()), run({ cap: 2 }))).toHaveLength(2);
  });

  it('makes one result per When and Do, and Set budget steps once per month', () => {
    const automation = build(
      rentInput({
        startDate: '2026-09-01',
        triggers: [
          { type: 'schedule', every: 1, unit: 'month', monthDay: { kind: 'day', day: 1 } },
          { type: 'schedule', every: 1, unit: 'month', monthDay: { kind: 'day', day: 15 } },
        ],
        actions: [
          ...rentInput().actions,
          { type: 'setBudget', categoryId: 'rent', amount: { type: 'fixed', value: '900' } },
        ],
      }),
    );
    const results = buildScheduledResults(
      automation,
      run({ existingBudgetIds: new Set(['rent:2026-10']) }),
    );
    expect(results.map((r) => r.record.id)).toEqual([
      scheduledResultId('auto', 0, 0, '2026-09-01'),
      'rent:2026-09',
      scheduledResultId('auto', 0, 0, '2026-10-01'),
      scheduledResultId('auto', 1, 0, '2026-09-15'),
    ]);
    expect(results[1]).toEqual({
      entity: 'budgets',
      sourceId: null,
      record: {
        id: 'rent:2026-09',
        categoryId: 'rent',
        month: '2026-09',
        limitMinor: 90_000,
        currency: 'EUR',
        automationId: 'auto',
        recurring: false,
        deleted: false,
      },
    });
  });

  it('finds the next date after today', () => {
    expect(nextDate(build(rentInput()), '2026-10-05')).toBe('2026-11-01');
    expect(nextDate(build(rentInput({ endDate: '2026-10-31' })), '2026-10-05')).toBeNull();
    expect(nextDate(build(saveInput()), '2026-10-05')).toBeNull();
  });
});

describe('automation conditions', () => {
  /** @type {import('../../../src/core/domain/automation.js').ConditionGroup} */
  const aAndBOrC = {
    match: 'all',
    items: [
      { field: 'account', op: 'is', accountId: 'checking' },
      {
        match: 'any',
        items: [
          { field: 'payee', op: 'contains', text: 'acme' },
          { field: 'amount', op: 'atLeast', amountMinor: 100_000, currency: 'EUR' },
        ],
      },
    ],
  };

  it('combines all and any in one nested group', () => {
    expect(matches(aAndBOrC, tx({ payee: 'Acme Ltd', amountMinor: 1 }), currencyOf)).toBe(true);
    expect(matches(aAndBOrC, tx({ payee: 'Other', amountMinor: 100_000 }), currencyOf)).toBe(true);
    expect(matches(aAndBOrC, tx({ payee: 'Other', amountMinor: 99_999 }), currencyOf)).toBe(false);
    expect(matches(aAndBOrC, tx({ accountId: 'savings' }), currencyOf)).toBe(false);
    expect(matches(null, tx({}), currencyOf)).toBe(true);
  });

  it('compares amounts only in the same currency, and checks empty categories', () => {
    /** @type {import('../../../src/core/domain/automation.js').ConditionGroup} */
    const group = {
      match: 'any',
      items: [{ field: 'amount', op: 'atMost', amountMinor: 1000, currency: 'EUR' }],
    };
    expect(matches(group, tx({ accountId: 'dollars', amountMinor: 5 }), currencyOf)).toBe(false);
    expect(matches(group, tx({ amountMinor: 5 }), currencyOf)).toBe(true);
    /** @type {import('../../../src/core/domain/automation.js').ConditionGroup} */
    const empty = { match: 'all', items: [{ field: 'category', op: 'isEmpty' }] };
    expect(matches(empty, tx({ categoryId: null }), currencyOf)).toBe(true);
    expect(matches(empty, tx({}), currencyOf)).toBe(false);
  });

  it('never lets automatic transactions or adjustments set anything off', () => {
    expect(canTrigger(tx({}))).toBe(true);
    expect(canTrigger(tx({ automationId: 'a' }))).toBe(false);
    expect(canTrigger(tx({ recurringRuleId: 'old' }))).toBe(false);
    expect(canTrigger(tx({ adjustment: true }))).toBe(false);
  });
});

describe('automation results', () => {
  it('rounds percentages half up in integer arithmetic', () => {
    expect(resolveAmount({ type: 'percent', basisPoints: 1000 }, { amountMinor: 12_345 })).toBe(
      1235,
    );
    expect(resolveAmount({ type: 'percent', basisPoints: 1 }, { amountMinor: 4999 })).toBe(0);
    expect(resolveAmount({ type: 'percent', basisPoints: 1000 }, null)).toBeNull();
    expect(resolveAmount({ type: 'fixed', amountMinor: 7 }, null)).toBe(7);
  });

  it('fills in words from the date and the recorded transaction', () => {
    const ctx = { date: '2026-03-31', source: tx({ note: 'bonus' }), sourceCurrency: 'EUR' };
    expect(fillWords('{payee} {amount} {note} {month} {year} {date}', ctx, 500)).toBe(
      'ACME 2500.00 EUR bonus March 2026 2026-03-31',
    );
    expect(fillWords('Rent {payee}', { ...ctx, source: null, sourceCurrency: null }, 500)).toBe(
      'Rent',
    );
    expect(fillWords('{payee}{payee}', ctx, 6)).toBe('ACMEAC');
  });

  it('reacts once per recorded transaction inside its window', () => {
    const automation = build(saveInput());
    const sources = [
      tx({ id: 'early', date: '2026-09-30' }),
      tx({ id: 'salary' }),
      tx({ id: 'future', date: '2026-10-06' }),
      tx({ id: 'done' }),
      tx({ id: 'mine', automationId: 'x' }),
      tx({ id: 'spent', kind: 'expense', categoryId: 'rent' }),
    ];
    const results = buildEventResults(
      automation,
      sources,
      run({ existingIds: new Set([eventResultId('auto', 0, 'done')]) }),
    );
    expect(results).toEqual([
      {
        entity: 'transactions',
        sourceId: 'salary',
        record: {
          id: eventResultId('auto', 0, 'salary'),
          kind: 'transfer',
          accountId: 'checking',
          toAccountId: 'savings',
          categoryId: null,
          payee: '',
          note: '10% of ACME',
          date: '2026-10-05',
          amountMinor: 25_000,
          automationId: 'auto',
          deleted: false,
        },
      },
    ]);
  });

  it('skips a percentage in another currency or one that rounds to nothing', () => {
    const automation = build(saveInput({ conditions: null }));
    const sources = [tx({ id: 'usd', accountId: 'dollars' }), tx({ id: 'tiny', amountMinor: 4 })];
    expect(buildEventResults(automation, sources, run())).toEqual([]);
  });

  it('runs now with fresh IDs and only fixed amounts', () => {
    const rent = build(rentInput());
    let n = 0;
    const results = buildRunNowResults(rent, '2026-10-05', () => `r${(n += 1)}`, currencyOf);
    expect(results.map((r) => [r.record.id, dateOf(r)])).toEqual([['auto:run:r1', '2026-10-05']]);
    expect(canRunNow(rent)).toBe(true);
    expect(canRunNow(build(saveInput()))).toBe(false);
  });

  it('lists the accounts and categories it uses', () => {
    const automation = build(
      saveInput({
        conditions: {
          match: 'any',
          items: [
            { field: 'category', op: 'is', categoryId: 'salary' },
            { field: 'account', op: 'isNot', accountId: 'dollars' },
          ],
        },
        actions: [
          ...saveInput().actions,
          { type: 'setBudget', categoryId: 'rent', amount: { type: 'fixed', value: '1' } },
        ],
      }),
    );
    expect(referencedIds(automation)).toEqual({
      accountIds: new Set(['dollars', 'checking', 'savings']),
      categoryIds: new Set(['salary', 'rent']),
    });
  });
});
