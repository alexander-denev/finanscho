import { describe, expect, it } from 'vitest';
import { accountEdits, createAccount } from '../../../src/core/domain/account.js';
import { fieldErrors } from '../../helpers/fieldErrors.js';

const ctx = { id: 'id-1', now: '2024-05-01T10:00:00.000Z' };

describe('account', () => {
  it('creates a normalized account', () => {
    const account = createAccount(
      { name: '  Wallet ', type: 'cash', currency: 'eur', openingBalance: '-12,50', color: 'teal' },
      ctx,
    );
    expect(account).toMatchObject({
      id: 'id-1',
      name: 'Wallet',
      currency: 'EUR',
      openingBalanceMinor: -1250,
      archived: false,
      deleted: false,
    });
  });

  it('treats an empty opening balance as zero', () => {
    const account = createAccount(
      { name: 'A', type: 'checking', currency: 'EUR', openingBalance: '' },
      ctx,
    );
    expect(account.openingBalanceMinor).toBe(0);
    expect(account.color).toBeNull();
  });

  it('reports every invalid field', () => {
    expect(
      fieldErrors(() =>
        createAccount(
          { name: '', type: 'bogus', currency: 'XX', openingBalance: 'abc', color: 'neon' },
          ctx,
        ),
      ),
    ).toEqual({
      name: 'validation.required',
      type: 'validation.required',
      currency: 'validation.currency',
      openingBalance: 'validation.money.invalid',
      color: 'validation.invalid',
    });
  });

  it('keeps the currency on edit', () => {
    const account = createAccount(
      { name: 'Yen', type: 'cash', currency: 'JPY', openingBalance: '100' },
      ctx,
    );
    expect(
      fieldErrors(() =>
        accountEdits(account, { name: 'Y', type: 'cash', currency: 'EUR', openingBalance: '1.5' }),
      ),
    ).toEqual({ openingBalance: 'validation.money.tooManyDecimals' });
  });
});
