import { describe, expect, it } from 'vitest';
import {
  errorMessage,
  formatBytes,
  formatDate,
  formatMonth,
  formatRelativeTime,
  t,
} from '../../../src/ui/i18n/i18n.js';
import { ValidationError, SyncError, BackupError } from '../../../src/core/errors.js';
import { EN } from '../../../src/ui/i18n/en.js';

describe('i18n', () => {
  it('translates with parameters and falls back to the key', () => {
    expect(t('budgets.left', { amount: '€5.00' })).toBe('€5.00 left');
    expect(t('missing.key')).toBe('missing.key');
  });

  it('formats calendar dates without time-zone shifts', () => {
    expect(formatDate('2024-01-01', 'medium')).toBe('Jan 1, 2024');
    expect(formatDate('2024-12-31', 'short')).toBe('Dec 31');
    expect(formatMonth('2024-05')).toBe('May 2024');
  });

  it('formats relative times', () => {
    const now = Date.parse('2024-05-15T10:00:00Z');
    expect(formatRelativeTime('2024-05-15T09:55:00Z', now)).toBe('5 minutes ago');
    expect(formatRelativeTime('2024-05-14T10:00:00Z', now)).toBe('yesterday');
  });

  it('formats byte counts in decimal units', () => {
    expect(formatBytes(0)).toBe('0 byte');
    expect(formatBytes(950)).toBe('950 byte');
    expect(formatBytes(2_500_000)).toBe('2.5 MB');
    expect(formatBytes(1_000_000_000)).toBe('1 GB');
  });

  it('maps errors to user-readable messages and never shows raw text', () => {
    expect(errorMessage(new SyncError('auth', 'HTTP 401 from https://x'))).toBe(
      t('errors.sync.auth'),
    );
    expect(errorMessage(new BackupError('formatTooNew'))).toBe(t('errors.backupFormatTooNew'));
    expect(errorMessage(new ValidationError({ a: 'validation.required' }))).toBe(
      t('errors.validation'),
    );
    expect(errorMessage(new Error('internal details'))).toBe(t('errors.unknown'));
  });

  it('has a message for every sync failure reason and every validation key used in the domain', () => {
    for (const reason of [
      'notConfigured',
      'offline',
      'network',
      'auth',
      'notFound',
      'server',
      'vaultTooNew',
      'malformed',
      'unknown',
    ]) {
      expect(EN[`errors.sync.${reason}`]).toBeTruthy();
    }
    for (const key of ['empty', 'invalid', 'tooManyDecimals', 'tooLarge', 'negative', 'zero']) {
      expect(EN[`validation.money.${key}`]).toBeTruthy();
    }
  });
});
