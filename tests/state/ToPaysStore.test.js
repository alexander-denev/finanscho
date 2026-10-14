import { describe, expect, it } from 'vitest';
import { createTestStores } from '../helpers/testStores.js';

describe('ToPaysStore', () => {
  it('lists To pays and follows creates, edits, payments, and deletes', async () => {
    const t = await createTestStores();
    const { toPays, accounts, transactions } = t.stores;
    const main = await accounts.create({
      name: 'Main',
      type: 'checking',
      currency: 'EUR',
      openingBalance: '0',
    });
    /**
     * @param {string} payee
     * @param {string} dueDate
     */
    const input = (payee, dueDate) => ({
      kind: 'expense',
      amount: '10',
      accountId: main.id,
      payee,
      dueDate,
    });
    const gym = await toPays.create(input('Gym', '2024-06-01'));
    const rent = await toPays.create(input('Rent', '2024-05-20'));
    await t.settled();
    expect(toPays.status.value).toBe('idle');
    expect(toPays.items.value.map((item) => item.payee)).toEqual(['Rent', 'Gym']);

    await toPays.edit(gym.id, input('Gym', '2024-05-16'));
    await t.settled();
    expect(toPays.items.value.map((item) => item.payee)).toEqual(['Gym', 'Rent']);

    await toPays.pay(rent.id);
    await toPays.remove(gym.id);
    await t.settled();
    expect(toPays.items.value).toEqual([]);
    expect(transactions.days.value.flatMap((day) => day.items).map((tx) => tx.payee)).toEqual([
      'Rent',
    ]);
  });
});
