import { describe, expect, it } from 'vitest';
import { IdbSettingsRepository } from '../../../../src/infrastructure/db/repositories/IdbSettingsRepository.js';
import { createTestDb } from '../../../helpers/testDb.js';

describe('IdbSettingsRepository', () => {
  it('stores device-local settings', async () => {
    const settings = new IdbSettingsRepository(await createTestDb());
    expect(await settings.get('theme')).toBeUndefined();
    await settings.set('theme', 'dark');
    expect(await settings.get('theme')).toBe('dark');
  });
});
