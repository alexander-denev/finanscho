import { describe, expect, it } from 'vitest';
import { createTestStores } from '../helpers/testStores.js';

describe('SettingsStore', () => {
  it('updates preferences and exports/imports backups', async () => {
    const t = await createTestStores();
    const { settings } = t.stores;
    expect(settings.values.value.theme).toBe('system');
    await settings.setTheme('dark');
    await settings.setDeviceName('Laptop');
    await settings.setDefaultCurrency('chf');
    expect(settings.values.value).toEqual({
      theme: 'dark',
      deviceName: 'Laptop',
      defaultCurrency: 'CHF',
    });

    await t.stores.accounts.create({
      name: 'Main',
      type: 'cash',
      currency: 'EUR',
      openingBalance: '1',
    });
    const backup = await settings.exportBackup();
    expect(backup.fileName).toBe('finanscho-backup-2024-05-15.json');
    const other = await createTestStores({ deviceId: '44444444-4444-4444-8444-444444444444' });
    expect(await other.stores.settings.importBackup(backup.json)).toBeGreaterThan(0);
    await other.settled();
    expect(other.stores.accounts.items.value.map((a) => a.account.name)).toEqual(['Main']);
    await expect(settings.importBackup('nope')).rejects.toMatchObject({ code: 'backupInvalid' });
  });
});
