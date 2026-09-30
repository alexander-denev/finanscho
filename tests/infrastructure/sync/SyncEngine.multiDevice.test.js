import { describe, expect, it } from 'vitest';
import { InMemoryWebDav, networkError } from '../../helpers/InMemoryWebDav.js';
import { createDevice, syncUntilQuiet } from '../../helpers/simulatedDevice.js';
import { createRandom } from '../../helpers/random.js';

/** @typedef {Awaited<ReturnType<typeof createDevice>>} Device */

/**
 * @param {Device[]} devices
 * @returns {Promise<void>}
 */
async function expectConverged(devices) {
  const [first, ...rest] = await Promise.all(devices.map((d) => d.snapshot()));
  for (const other of rest) expect(other).toBe(first);
  const lists = await Promise.all(
    devices.map(async (d) =>
      JSON.stringify((await d.services.transactions.query({ limit: 10_000 })).items),
    ),
  );
  for (const list of lists.slice(1)) expect(list).toBe(lists[0]);
}

describe('multi-device sync convergence', () => {
  it('converges after offline edits, deletes, and independent recurring materialization', async () => {
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
    const rule = await a.services.recurring.create({
      frequency: 'monthly',
      interval: 1,
      startDate: '2024-03-10',
      endDate: null,
      template: {
        kind: 'expense',
        amount: '800',
        accountId: joint.id,
        categoryId: 'seed:housing',
        payee: 'Rent',
      },
    });
    await a.sync();
    await b.sync();
    await c.sync();

    // A month passes. B and C each materialize June's rent independently, offline.
    for (const d of [a, b, c]) d.clock.advanceDays(31);
    expect(await b.services.recurring.materialize()).toBe(1);
    expect(await c.services.recurring.materialize()).toBe(1);

    // Conflicting offline edits.
    const aprilRent = `${rule.id}:2024-04-10`;
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
    const juneRent = await b.services.transactions.get(`${rule.id}:2024-06-10`);
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

  it('converges for randomized offline histories and sync orders (property)', async () => {
    for (let seed = 1; seed <= 12; seed += 1) {
      const rnd = createRandom(seed);
      const server = new InMemoryWebDav();
      const devices = [
        await createDevice(server, 'A'),
        await createDevice(server, 'B', { clockIso: '2024-05-15T08:00:00.000Z' }),
        await createDevice(server, 'C', { clockIso: '2024-05-15T12:00:00.000Z' }),
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
          await d.services.budgets.set({
            categoryId: rnd.pick(categories),
            month: '2024-05',
            limit: String(1 + rnd.int(900)),
          });
        } else if (action === 6 && rnd.next() < 0.3) {
          await d.services.recurring.create({
            frequency: rnd.pick(['daily', 'weekly', 'monthly']),
            interval: 1 + rnd.int(3),
            startDate: '2024-04-20',
            endDate: null,
            template: {
              kind: 'expense',
              amount: '10',
              accountId: shared.id,
              categoryId: rnd.pick(categories),
            },
          });
        } else if (action === 7) {
          d.clock.advance(rnd.int(3) * 3_600_000 + rnd.int(60_000));
        } else {
          if (rnd.next() < 0.15) {
            server.failNext({
              method: 'PUT',
              pathIncludes: `${d.deviceId}/head.json`,
              error: networkError(),
            });
          }
          await d.sync().catch(() => d.restart());
        }
      }
      server.clearFailures();
      await syncUntilQuiet(devices);
      await expectConverged(devices);
    }
  }, 60_000);
});
