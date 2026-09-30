import { describe, expect, it } from 'vitest';
import {
  buildDefaultCategories,
  categoryEdits,
  createCategory,
} from '../../../src/core/domain/category.js';
import { fieldErrors } from '../../helpers/fieldErrors.js';

const ctx = { id: 'id-1', now: '2024-05-01T10:00:00.000Z' };

describe('category', () => {
  it('creates and edits categories without changing the kind', () => {
    const cat = createCategory(
      { name: 'Pets', kind: 'expense', color: 'amber', icon: 'heart' },
      ctx,
    );
    expect(cat.kind).toBe('expense');
    expect(
      categoryEdits(cat, { name: 'Animals', kind: 'income', color: 'rose', icon: 'gift' }),
    ).toEqual({ name: 'Animals', color: 'rose', icon: 'gift' });
  });

  it('validates required fields', () => {
    expect(
      fieldErrors(() => createCategory({ name: ' ', kind: 'x', color: 'x', icon: 'x' }, ctx)),
    ).toEqual({
      name: 'validation.required',
      kind: 'validation.required',
      color: 'validation.required',
      icon: 'validation.required',
    });
  });

  it('builds deterministic seed categories', () => {
    const a = buildDefaultCategories();
    const b = buildDefaultCategories();
    expect(a).toEqual(b);
    expect(a.every((c) => c.id.startsWith('seed:'))).toBe(true);
    expect(new Set(a.map((c) => c.id)).size).toBe(a.length);
    expect(a.some((c) => c.kind === 'income')).toBe(true);
    expect(a.find((c) => c.id === 'seed:groceries')?.createdAt).toBe('1970-01-01T00:00:00.000Z');
  });
});
