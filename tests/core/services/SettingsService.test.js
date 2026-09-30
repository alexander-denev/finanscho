import { describe, expect, it } from 'vitest';
import { createTestServices } from '../../helpers/testServices.js';

describe('SettingsService', () => {
  it('loads defaults and stores device-local preferences', async () => {
    const { services } = await createTestServices();
    expect(await services.settings.load()).toEqual({
      defaultCurrency: 'EUR',
      theme: 'system',
      deviceName: '',
      storageNoticeDismissed: false,
    });
    await services.settings.setDefaultCurrency('usd');
    await services.settings.setTheme('dark');
    await services.settings.setDeviceName('  Phone ');
    await services.settings.dismissStorageNotice();
    expect(await services.settings.load()).toEqual({
      defaultCurrency: 'USD',
      theme: 'dark',
      deviceName: 'Phone',
      storageNoticeDismissed: true,
    });
  });

  it('validates values', async () => {
    const { services } = await createTestServices();
    await expect(services.settings.setTheme('neon')).rejects.toMatchObject({
      fields: { theme: 'validation.invalid' },
    });
    await expect(services.settings.setDefaultCurrency('ZZZZ')).rejects.toMatchObject({
      fields: { defaultCurrency: 'validation.currency' },
    });
    await expect(services.settings.setDeviceName(' ')).rejects.toMatchObject({
      fields: { deviceName: 'validation.required' },
    });
  });
});
