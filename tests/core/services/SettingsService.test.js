import { describe, expect, it } from 'vitest';
import { createTestServices } from '../../helpers/testServices.js';

describe('SettingsService', () => {
  it('loads defaults and stores device-local preferences', async () => {
    const { services } = await createTestServices();
    expect(await services.settings.load()).toEqual({
      defaultCurrency: 'EUR',
      theme: 'system',
      deviceName: '',
    });
    await services.settings.setDefaultCurrency('usd');
    await services.settings.setTheme('dark');
    await services.settings.setDeviceName('  Phone ');
    expect(await services.settings.load()).toEqual({
      defaultCurrency: 'USD',
      theme: 'dark',
      deviceName: 'Phone',
    });
  });

  it('records install-notice snoozes with the time and a count', async () => {
    const { services, clock } = await createTestServices();
    expect(await services.settings.loadInstallNotice()).toEqual({
      dismissedAt: null,
      dismissCount: 0,
    });
    expect(await services.settings.dismissInstallNotice()).toEqual({
      dismissedAt: '2024-05-15T10:00:00.000Z',
      dismissCount: 1,
    });
    clock.advanceDays(20);
    await services.settings.dismissInstallNotice();
    expect(await services.settings.loadInstallNotice()).toEqual({
      dismissedAt: '2024-06-04T10:00:00.000Z',
      dismissCount: 2,
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
