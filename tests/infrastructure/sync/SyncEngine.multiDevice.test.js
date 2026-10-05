import { describe, expect, it } from 'vitest';
import { InMemoryWebDav, networkError } from '../../helpers/InMemoryWebDav.js';
import { createDevice, syncUntilQuiet } from '../../helpers/simulatedDevice.js';
import { createRandom } from '../../helpers/random.js';
import { canonicalJson } from '../../../src/infrastructure/sync/merge.js';

/** @typedef {Awaited<ReturnType<typeof createDevice>>} Device */

/**
 * @param {Device[]} devices
 * @param {{ stubs?: boolean }} [options] compare with tombstones reduced to stubs (compaction and
 *   pruning drop tombstone fields older than the delete, which users never see)
 * @returns {Promise<void>}
 */
async function expectConverged(devices, options = {}) {
  const [first, ...rest] = await Promise.all(
    devices.map((d) => (options.stubs ? d.stubSnapshot() : d.snapshot())),
  );
  for (const other of rest) expect(other).toBe(first);
  // Same records in the same order; key order is not meaningful (checkpoints rebuild records).
  const lists = await Promise.all(
    devices.map(async (d) =>
      canonicalJson((await d.services.transactions.query({ limit: 10_000 })).items),
    ),
  );
  for (const list of lists.slice(1)) expect(list).toBe(lists[0]);
}

/**
 * A monthly expense automation.
 * @param {string} accountId
 * @param {string} firstDate
 * @param {string} [amount]
 * @returns {import('../../../src/core/domain/automation.js').AutomationInput}
 */
const monthly = (accountId, firstDate, amount = '800') => ({
  name: 'Rent',
  startDate: firstDate,
  triggers: [{ type: 'schedule', frequency: 'monthly', interval: 1, firstDate }],
  actions: [
    {
      type: 'createTransaction',
      template: { kind: 'expense', accountId, categoryId: 'seed:housing', payee: 'Rent' },
      amount: { type: 'fixed', value: amount },
    },
  ],
});

/**
 * Moves a share of every income in `from` to `to`.
 * @param {string} from
 * @param {string} to
 * @param {string} percent
 * @returns {import('../../../src/core/domain/automation.js').AutomationInput}
 */
const saveShare = (from, to, percent) => ({
  name: 'Save',
  startDate: '2024-05-01',
  triggers: [{ type: 'transactionRecorded' }],
  conditions: {
    match: 'all',
    items: [
      { field: 'kind', op: 'is', kind: 'income' },
      { field: 'account', op: 'is', accountId: from },
    ],
  },
  actions: [
    {
      type: 'createTransaction',
      template: { kind: 'transfer', accountId: from, toAccountId: to },
      amount: { type: 'percent', value: percent },
    },
  ],
});

/**
 * @param {Device} device
 * @param {string} name
 * @returns {Promise<string>}
 */
const account = async (device, name) =>
  (
    await device.services.accounts.create({
      name,
      type: 'checking',
      currency: 'EUR',
      openingBalance: '0',
    })
  ).id;

describe('multi-device sync convergence', () => {
  it('converges after offline edits, deletes, and independent automation runs', async () => {
    const server = new InMemoryWebDav();
    const a = await createDevice(server, 'A', { clockIso: '2024-05-15T10:00:00.000Z' });
    // B's clock runs an hour behind; C is 30 minutes ahead. HLCs absorb the skew.
    const b = await createDevice(server, 'B', { clockIso: '2024-05-15T09:00:00.000Z' });
    const c = await createDevice(server, 'C', { clockIso: '2024-05-15T10:30:00.000Z' });

    const joint = await a.services.accounts.create({
      name: 'Joint',
      type: 'checking',
      currency: 'EUR',
      openingBalance: '500',
    });
    const rent = await a.services.automations.create(monthly(joint.id, '2024-03-10'));
    await a.sync();
    await b.sync();
    await c.sync();

    // A month passes. B and C each make June's rent independently, offline.
    for (const d of [a, b, c]) d.clock.advanceDays(31);
    expect(await b.services.automations.run()).toBe(1);
    expect(await c.services.automations.run()).toBe(1);

    // Conflicting offline edits.
    const aprilRent = `${rent.id}:t0:a0:2024-04-10`;
    await b.services.transactions.remove(aprilRent);
    const april = await a.services.transactions.get(aprilRent);
    a.clock.advance(60_000);
    await a.services.transactions.update(aprilRent, {
      kind: 'expense',
      date: april.date,
      amount: '800',
      accountId: joint.id,
      categoryId: 'seed:housing',
      payee: 'Rent',
      note: 'paid late',
    });
    await a.services.budgets.set({ categoryId: 'seed:groceries', month: '2024-06', limit: '300' });
    c.clock.advance(120_000);
    await c.services.budgets.set({ categoryId: 'seed:groceries', month: '2024-06', limit: '350' });
    await c.services.categories.update('seed:groceries', {
      name: 'Food',
      kind: 'expense',
      color: 'olive',
      icon: 'cart',
    });
    await a.services.categories.setArchived('seed:groceries', true);
    await b.services.accounts.update(joint.id, {
      name: 'Household',
      type: 'checking',
      currency: 'EUR',
      openingBalance: '500',
    });
    await c.services.transactions.create({
      kind: 'income',
      date: '2024-06-14',
      amount: '2500',
      accountId: joint.id,
      categoryId: 'seed:salary',
    });

    // Interleaved sync order, then run until nothing moves.
    for (const d of [c, a, b, c, b, a]) await d.sync();
    await syncUntilQuiet([a, b, c]);
    await expectConverged([a, b, c]);

    // The delete and the note edit touch different fields: the tombstone hides the record.
    expect(await a.services.transactions.get(aprilRent).catch(() => null)).toBeNull();
    const juneRent = await b.services.transactions.get(`${rent.id}:t0:a0:2024-06-10`);
    expect(juneRent.amountMinor).toBe(80_000);
    const food = (await a.services.categories.list({ includeArchived: true })).find(
      (x) => x.id === 'seed:groceries',
    );
    expect(food).toMatchObject({ name: 'Food', archived: true });
    // Both devices set the same deterministic budget; the later write (C) wins everywhere.
    const [line] = (await a.services.budgets.forMonth('2024-06')).lines;
    expect(line.budget).toMatchObject({ id: 'seed:groceries:2024-06', limitMinor: 35_000 });
    expect((await c.services.accounts.get(joint.id)).name).toBe('Household');
  });

  it('restores an account one device deleted while another used it', async () => {
    const server = new InMemoryWebDav();
    const a = await createDevice(server, 'A');
    const b = await createDevice(server, 'B');
    const wallet = await a.services.accounts.create({
      name: 'Wallet',
      type: 'cash',
      currency: 'EUR',
      openingBalance: '0',
    });
    await a.sync();
    await b.sync();

    // Offline: A deletes the account while it is still empty; B records a purchase in it.
    await a.services.accounts.remove(wallet.id);
    b.clock.advance(60_000);
    await b.services.transactions.create({
      kind: 'expense',
      date: '2024-05-15',
      amount: '4',
      accountId: wallet.id,
    });
    await syncUntilQuiet([a, b]);
    await expectConverged([a, b]);
    for (const d of [a, b]) {
      expect((await d.services.accounts.get(wallet.id)).name).toBe('Wallet');
      expect((await d.services.accounts.listWithBalances())[0].balanceMinor).toBe(-400);
    }
  });

  it('sets the same budget once on every device, and a user edit beats it', async () => {
    const server = new InMemoryWebDav();
    const a = await createDevice(server, 'A');
    const b = await createDevice(server, 'B');
    const groceries = await a.services.automations.create({
      name: 'Groceries',
      startDate: '2024-05-01',
      triggers: [{ type: 'schedule', frequency: 'monthly', interval: 1, firstDate: '2024-05-01' }],
      actions: [
        {
          type: 'setBudget',
          categoryId: 'seed:groceries',
          amount: { type: 'fixed', value: '300' },
        },
      ],
    });
    await a.sync();
    await b.sync();

    // June arrives. Both set June's budget offline; then A changes June's limit by hand.
    for (const d of [a, b]) d.clock.set('2024-06-01T07:00:00.000Z');
    expect(await a.services.automations.run()).toBe(1);
    expect(await b.services.automations.run()).toBe(1);
    a.clock.advance(60_000);
    await a.services.budgets.set({ categoryId: 'seed:groceries', month: '2024-06', limit: '320' });
    await syncUntilQuiet([b, a]);
    await expectConverged([a, b]);
    const [june] = (await b.services.budgets.forMonth('2024-06')).lines;
    expect(june.budget).toMatchObject({ limitMinor: 32_000, automationId: null });
    const [may] = (await b.services.budgets.forMonth('2024-05')).lines;
    expect(may.budget).toMatchObject({ limitMinor: 30_000, automationId: groceries.id });
  });

  it('never fills the days an automation was stopped, on any device', async () => {
    const server = new InMemoryWebDav();
    const a = await createDevice(server, 'A');
    const b = await createDevice(server, 'B');
    const main = await account(a, 'Main');
    const rent = await a.services.automations.create(monthly(main, '2024-05-01', '10'));
    await a.services.automations.stop(rent.id);
    await a.sync();
    await b.sync();

    for (const d of [a, b]) d.clock.set('2024-08-20T07:00:00.000Z');
    await a.services.automations.resume(rent.id);
    await a.sync();
    await b.sync();
    for (const d of [a, b]) d.clock.set('2024-09-02T07:00:00.000Z');
    await b.services.automations.run();
    await syncUntilQuiet([a, b]);
    await expectConverged([a, b]);
    const dates = (await a.services.transactions.query({ limit: 50 })).items.map((x) => x.date);
    expect(dates).toEqual(['2024-09-01', '2024-05-01']);
    expect((await b.services.automations.list()).map((x) => x.automation.id)).toEqual([rent.id]);
  });

  it('makes one transfer when two devices react to the same income', async () => {
    const server = new InMemoryWebDav();
    const a = await createDevice(server, 'A');
    const b = await createDevice(server, 'B');
    const checking = await account(a, 'Checking');
    const savings = await account(a, 'Savings');
    await a.services.automations.create(saveShare(checking, savings, '10'));
    await a.sync();
    await b.sync();

    // B records a salary and pushes it before reacting; A then reacts to it too.
    await b.services.transactions.create({
      kind: 'income',
      date: '2024-05-15',
      amount: '2000',
      accountId: checking,
    });
    await b.sync();
    expect(await b.services.automations.run()).toBe(1);
    await a.sync();
    await syncUntilQuiet([a, b]);
    await expectConverged([a, b]);
    const transfers = (await a.services.transactions.query({ limit: 50 })).items.filter(
      (x) => x.kind === 'transfer',
    );
    expect(transfers.map((x) => x.amountMinor)).toEqual([20_000]);
  });

  it('lets the edited version win when an offline device still runs the old one', async () => {
    const server = new InMemoryWebDav();
    const a = await createDevice(server, 'A');
    const b = await createDevice(server, 'B');
    const checking = await account(a, 'Checking');
    const savings = await account(a, 'Savings');
    const save = await a.services.automations.create(saveShare(checking, savings, '10'));
    await a.sync();
    await b.sync();

    // A raises the share to 20% (not synced yet). B records a salary, pushes it, and reacts with
    // the 10% it knows. A then sees the salary and reacts with 20%: same result ID, newer clock.
    a.clock.advance(60_000);
    await a.services.automations.edit(save.id, saveShare(checking, savings, '20'));
    b.clock.advance(120_000);
    const salary = await b.services.transactions.create({
      kind: 'income',
      date: '2024-05-15',
      amount: '2000',
      accountId: checking,
    });
    await b.sync();
    expect(await b.services.automations.run()).toBe(1);
    await a.sync();
    await syncUntilQuiet([a, b]);
    await expectConverged([a, b]);
    const transfer = await b.services.transactions.get(`${save.id}:a0:${salary.id}`);
    expect(transfer.amountMinor).toBe(40_000);
  });

  it('converges for randomized histories, sync orders, compaction, and pruning (property)', async () => {
    // Guards against a vacuous pass: the histories must really compact and prune.
    let compactions = 0;
    let pruned = 0;
    for (let seed = 1; seed <= 12; seed += 1) {
      const rnd = createRandom(seed);
      const server = new InMemoryWebDav();
      // A low threshold makes devices compact on their own every few dozen ops.
      const compactMinOps = 15 + rnd.int(30);
      const devices = [
        await createDevice(server, 'A', { compactMinOps }),
        await createDevice(server, 'B', { clockIso: '2024-05-15T08:00:00.000Z', compactMinOps }),
        await createDevice(server, 'C', { clockIso: '2024-05-15T12:00:00.000Z', compactMinOps }),
      ];
      const shared = await devices[0].services.accounts.create({
        name: 'Shared',
        type: 'cash',
        currency: 'EUR',
        openingBalance: '0',
      });
      await syncUntilQuiet(devices);
      const categories = ['seed:groceries', 'seed:dining', 'seed:transport'];

      for (let step = 0; step < 40; step += 1) {
        const d = rnd.pick(devices);
        const action = rnd.int(10);
        const visible = (await d.services.transactions.query({ limit: 1000 })).items;
        if (action <= 2) {
          await d.services.transactions.create({
            kind: 'expense',
            date: `2024-05-${String(1 + rnd.int(28)).padStart(2, '0')}`,
            amount: String(1 + rnd.int(500)),
            accountId: shared.id,
            categoryId: rnd.pick(categories),
            note: `n${rnd.int(5)}`,
          });
        } else if (action === 3 && visible.length > 0) {
          const tx = rnd.pick(visible);
          await d.services.transactions.update(tx.id, {
            kind: 'expense',
            date: tx.date,
            amount: String(1 + rnd.int(900)),
            accountId: tx.accountId,
            categoryId: rnd.pick(categories),
            note: `edited on ${d.name}`,
          });
        } else if (action === 4 && visible.length > 0) {
          await d.services.transactions.remove(rnd.pick(visible).id);
        } else if (action === 5) {
          // Repeated edits: many ops, constant state — the workload compaction exists for.
          const edits = 1 + rnd.int(25);
          for (let i = 0; i < edits; i += 1) {
            await d.services.budgets.set({
              categoryId: rnd.pick(categories),
              month: '2024-05',
              limit: String(1 + rnd.int(900)),
            });
          }
        } else if (action === 6 && rnd.next() < 0.3) {
          const onRecorded = rnd.next() < 0.5;
          await d.services.automations.create({
            name: `auto ${d.name}`,
            startDate: '2024-04-20',
            triggers: onRecorded
              ? [{ type: 'transactionRecorded' }]
              : [
                  {
                    type: 'schedule',
                    frequency: rnd.pick(['daily', 'weekly', 'monthly']),
                    interval: 1 + rnd.int(3),
                    firstDate: '2024-04-20',
                    weekend: rnd.pick(['keep', 'before', 'after']),
                  },
                ],
            conditions: onRecorded
              ? {
                  match: 'any',
                  items: [{ field: 'category', op: 'is', categoryId: rnd.pick(categories) }],
                }
              : null,
            actions: [
              {
                type: 'createTransaction',
                template: { kind: 'income', accountId: shared.id, note: '{payee}{month}' },
                amount: onRecorded
                  ? { type: 'percent', value: String(1 + rnd.int(50)) }
                  : { type: 'fixed', value: '10' },
              },
            ],
          });
        } else if (action === 6) {
          const all = await d.services.automations.list();
          if (all.length > 0) {
            const target = rnd.pick(all).automation.id;
            await (rnd.next() < 0.5
              ? d.services.automations.stop(target)
              : d.services.automations.resume(target));
          }
        } else if (action === 7) {
          d.clock.advance(rnd.int(3) * 3_600_000 + rnd.int(60_000));
        } else if (action === 8 && rnd.next() < 0.3) {
          // Local-only: every tombstone becomes a stub right away.
          pruned += await d.recorder.pruneTombstones(d.clock.nowMs(), 0);
        } else {
          if (rnd.next() < 0.15) {
            server.failNext({
              method: 'PUT',
              pathIncludes: `${d.deviceId}/head.json`,
              error: networkError(),
            });
          }
          if (rnd.next() < 0.1) {
            server.failNext({ method: 'DELETE', pathIncludes: d.deviceId, status: 405 });
          }
          const run = rnd.next() < 0.2 ? () => d.engine.compactNow() : () => d.sync();
          await run().then(
            (result) => {
              if (result.compacted) compactions += 1;
            },
            () => d.restart(),
          );
        }
      }
      server.clearFailures();
      await syncUntilQuiet(devices);
      await expectConverged(devices, { stubs: true });
      // A device joining now bootstraps from checkpoints and frontiers and sees the same data.
      // Same day as the latest device, so its automations make nothing the others lack.
      const clockIso = devices
        .map((d) => d.clock.nowIso())
        .sort()
        .at(-1);
      const late = await createDevice(server, 'L', { clockIso });
      await late.sync();
      await expectConverged([...devices, late], { stubs: true });
    }
    expect(compactions).toBeGreaterThan(5);
    expect(pruned).toBeGreaterThan(0);
  }, 60_000);
});
