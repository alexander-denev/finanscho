import { beforeEach, describe, expect, it } from 'vitest';
import { STORES } from '../../../../src/infrastructure/db/database.js';
import { IdbAutomationRepository } from '../../../../src/infrastructure/db/repositories/IdbAutomationRepository.js';
import { IdbTransactionRepository } from '../../../../src/infrastructure/db/repositories/IdbTransactionRepository.js';
import { HybridLogicalClock } from '../../../../src/infrastructure/sync/HybridLogicalClock.js';
import { createTestDb } from '../../../helpers/testDb.js';

/** @typedef {import('../../../../src/core/domain/automation.js').Automation} Automation */
/** @typedef {import('../../../../src/core/domain/automation.js').AutomationResult} AutomationResult */

/** @type {Automation} */
const automation = {
  id: 'auto',
  name: 'Rent',
  triggers: [
    {
      type: 'schedule',
      frequency: 'monthly',
      interval: 1,
      firstDate: '2024-01-01',
      lastDayOfMonth: false,
      weekend: 'keep',
    },
  ],
  conditions: null,
  actions: [
    {
      type: 'createTransaction',
      template: {
        kind: 'expense',
        accountId: 'a1',
        toAccountId: null,
        categoryId: null,
        payee: '',
        note: '',
      },
      amount: { type: 'fixed', amountMinor: 100 },
    },
  ],
  startDate: '2024-01-01',
  endDate: null,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  deleted: false,
};

/**
 * @param {string} id
 * @param {string | null} [sourceId]
 * @returns {AutomationResult}
 */
const result = (id, sourceId = null) => ({
  entity: 'transactions',
  sourceId,
  record: {
    id,
    kind: 'expense',
    date: '2024-02-01',
    amountMinor: 100,
    accountId: 'a1',
    toAccountId: null,
    categoryId: null,
    payee: '',
    note: '',
    automationId: 'auto',
    deleted: false,
  },
});

describe('IdbAutomationRepository', () => {
  /** @type {Awaited<ReturnType<typeof createTestDb>>} */
  let env;
  /** @type {IdbAutomationRepository} */
  let repo;
  /** @type {IdbTransactionRepository} */
  let transactions;

  beforeEach(async () => {
    env = await createTestDb();
    repo = new IdbAutomationRepository({ db: env.db, recorder: env.recorder });
    transactions = new IdbTransactionRepository({ db: env.db, recorder: env.recorder });
    await repo.create(automation);
  });

  /** @param {string} id */
  const stored = (id) => env.db.get(STORES.transactions, id);

  it('stores, edits in place, lists by name, and deletes', async () => {
    await repo.create({ ...automation, id: 'b', name: 'Allowance' });
    await repo.update('auto', { name: 'Flat', updatedAt: 'u' });
    expect((await repo.list()).map((a) => a.name)).toEqual(['Allowance', 'Flat']);
    await repo.remove('b', 'u');
    expect(await repo.get('b')).toBeNull();
    expect((await repo.get('auto'))?.triggers).toEqual(automation.triggers);
  });

  it('writes results once, with the rule clock and its time, never over a deleted one', async () => {
    expect(await repo.writeResults('auto', [result('auto:x'), result('auto:y')])).toBe(2);
    const ruleClock = (await env.db.get(STORES.automations, 'auto'))._clocks.triggers;
    const x = await stored('auto:x');
    expect(Object.values(x._clocks).every((c) => c === ruleClock)).toBe(true);
    const wallMs = /** @type {{ wallMs: number }} */ (HybridLogicalClock.parse(ruleClock)).wallMs;
    expect(x.createdAt).toBe(new Date(wallMs).toISOString());
    const outbox = await env.db.getAll(STORES.outbox);
    expect(outbox.filter((op) => op.origin === 'automation')).toHaveLength(2);

    await transactions.remove('auto:y', 'u');
    expect(await repo.writeResults('auto', [result('auto:x'), result('auto:y')])).toBe(0);
    expect(await transactions.get('auto:y')).toBeNull();
  });

  it('uses a newer clock after the rule is edited, but not after a rename', async () => {
    const before = (await env.db.get(STORES.automations, 'auto'))._clocks.triggers;
    env.clock.advance(1000);
    await repo.update('auto', { name: 'Flat', updatedAt: 'u' });
    await repo.writeResults('auto', [result('auto:a')]);
    expect((await stored('auto:a'))._clocks.amountMinor).toBe(before);
    env.clock.advance(1000);
    await repo.update('auto', { actions: automation.actions, updatedAt: 'u' });
    await repo.writeResults('auto', [result('auto:b')]);
    expect((await stored('auto:b'))._clocks.amountMinor > before).toBe(true);
  });

  it('keeps the rule clock for results of a newer transaction, dated like it', async () => {
    const ruleClock = (await env.db.get(STORES.automations, 'auto'))._clocks.triggers;
    env.clock.advance(5000);
    const later = '2024-05-15T10:00:05.000Z';
    const { record } = result('src');
    await transactions.create({
      .../** @type {import('../../../../src/core/domain/transaction.js').Transaction} */ (record),
      automationId: null,
      createdAt: later,
      updatedAt: later,
    });
    expect(await repo.writeResults('auto', [result('auto:a0:src', 'src')])).toBe(1);
    const made = await stored('auto:a0:src');
    expect(made._clocks.amountMinor).toBe(ruleClock);
    expect(made.createdAt).toBe(later);
    expect(await repo.writeResults('auto', [result('auto:a0:gone', 'gone')])).toBe(0);
  });

  it('writes nothing for a deleted automation, and skips budget months that exist', async () => {
    /** @type {AutomationResult} */
    const budget = {
      entity: 'budgets',
      sourceId: null,
      record: {
        id: 'c1:2024-02',
        categoryId: 'c1',
        month: '2024-02',
        limitMinor: 100,
        currency: 'EUR',
        automationId: 'auto',
        recurring: false,
        deleted: false,
      },
    };
    expect(await repo.writeResults('auto', [budget])).toBe(1);
    expect(await repo.writeResults('auto', [budget])).toBe(0);
    await repo.remove('auto', 'u');
    expect(await repo.writeResults('auto', [result('auto:z')])).toBe(0);
  });
});
