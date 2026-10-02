import { describe, expect, it } from 'vitest';
import { budgetId, budgetProgress, normalizeBudgetInput } from '../../../src/core/domain/budget.js';
import { fieldErrors } from '../../helpers/fieldErrors.js';

describe('budget', () => {
  it('uses deterministic ids and validates expense categories', () => {
    expect(budgetId('seed:groceries', '2024-05')).toBe('seed:groceries:2024-05');
    expect(
      normalizeBudgetInput(
        { categoryId: 'c', month: '2024-05', limit: '300' },
        { kind: 'expense' },
        'EUR',
      ),
    ).toEqual({
      id: 'c:2024-05',
      categoryId: 'c',
      month: '2024-05',
      limitMinor: 30000,
      recurring: false,
      currency: 'EUR',
    });
    expect(
      fieldErrors(() =>
        normalizeBudgetInput(
          { categoryId: 'c', month: '2024-13', limit: 'x' },
          { kind: 'income' },
          'EUR',
        ),
      ),
    ).toEqual({
      categoryId: 'validation.categoryKind',
      month: 'validation.month',
      limit: 'validation.money.invalid',
    });
  });

  it('computes progress', () => {
    expect(budgetProgress(10000, 5000)).toMatchObject({
      ratio: 0.5,
      status: 'under',
      remainingMinor: 5000,
    });
    expect(budgetProgress(10000, 9000).status).toBe('near');
    expect(budgetProgress(10000, 10000).status).toBe('near');
    expect(budgetProgress(10000, 12000)).toMatchObject({ status: 'over', remainingMinor: -2000 });
    expect(budgetProgress(0, 0)).toMatchObject({ ratio: 0, status: 'under' });
    expect(budgetProgress(0, 1).status).toBe('over');
  });
});
