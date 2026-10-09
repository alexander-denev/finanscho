import { describe, expect, it } from 'vitest';
import {
  accountEdits,
  accountIcon,
  createAccount,
  isItemColor,
} from '../../../src/core/domain/account.js';
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

  it('stores no icon until one is chosen, and shows the type icon meanwhile', () => {
    const account = createAccount(
      { name: 'Jar', type: 'savings', currency: 'EUR', openingBalance: '0' },
      ctx,
    );
    expect(account.icon).toBeNull();
    expect(accountIcon(account)).toBe('piggyBank');
    expect(accountIcon({ ...account, type: 'creditCard' })).toBe('card');
    expect(accountIcon({ ...account, icon: 'gem' })).toBe('gem');
  });

  it('accepts icons from the pool and rejects others', () => {
    const input = { name: 'A', type: 'cash', currency: 'EUR', openingBalance: '0' };
    expect(createAccount({ ...input, icon: 'bitcoin' }, ctx).icon).toBe('bitcoin');
    expect(fieldErrors(() => createAccount({ ...input, icon: 'unicorn' }, ctx))).toEqual({
      icon: 'validation.invalid',
    });
  });

  it('accepts swatch names and lowercase #rrggbb colors', () => {
    expect(isItemColor('teal')).toBe(true);
    expect(isItemColor('navy')).toBe(true);
    expect(isItemColor('#aa3366')).toBe(true);
    expect(isItemColor('#AA3366')).toBe(false);
    expect(isItemColor('#abc')).toBe(false);
    expect(isItemColor('neon')).toBe(false);
    expect(isItemColor(null)).toBe(false);
  });

  it('keeps an icon or color this version does not know when editing other fields', () => {
    const synced = {
      ...createAccount({ name: 'A', type: 'cash', currency: 'EUR', openingBalance: '0' }, ctx),
      icon: /** @type {any} */ ('hovercraft'),
      color: 'ultraviolet',
    };
    const input = {
      name: 'Renamed',
      type: 'cash',
      currency: 'EUR',
      openingBalance: '0',
      icon: 'hovercraft',
      color: 'ultraviolet',
    };
    expect(accountEdits(synced, input)).toMatchObject({
      name: 'Renamed',
      icon: 'hovercraft',
      color: 'ultraviolet',
    });
    expect(fieldErrors(() => accountEdits(synced, { ...input, icon: 'jetpack' }))).toEqual({
      icon: 'validation.invalid',
    });
  });
});
