import { describe, expect, it } from 'vitest';
import { INSTALL_SNOOZE_MS } from '../../src/state/InstallStore.js';
import { FakeInstallEnvironment } from '../helpers/FakeInstallEnvironment.js';
import { createTestStores } from '../helpers/testStores.js';

/** @param {Awaited<ReturnType<typeof createTestStores>>} t */
async function addAccount(t) {
  await t.stores.accounts.create({
    name: 'Main',
    type: 'cash',
    currency: 'EUR',
    openingBalance: '10',
  });
  await t.settled();
}

describe('InstallStore', () => {
  it('recommends installing only once there is real data', async () => {
    const t = await createTestStores();
    const { install } = t.stores;
    // Seeded categories alone are not the user's data.
    expect(install.showBanner.value).toBe(false);
    await addAccount(t);
    expect(install.showBanner.value).toBe(true);
  });

  it('hides the recommendation when installed', async () => {
    const env = new FakeInstallEnvironment();
    const t = await createTestStores({ installEnvironment: env });
    await addAccount(t);
    expect(t.stores.install.showBanner.value).toBe(true);
    env.setStandalone(true);
    expect(t.stores.install.installed.value).toBe(true);
    expect(t.stores.install.showBanner.value).toBe(false);
  });

  it('snoozes for 14 days per "Not now" and stops after three dismissals', async () => {
    const t = await createTestStores();
    const { install } = t.stores;
    await addAccount(t);
    for (let i = 1; i <= 3; i += 1) {
      await install.dismiss();
      expect(install.showBanner.value).toBe(false);
      t.clock.advance(INSTALL_SNOOZE_MS - 1000);
      await install.load();
      expect(install.showBanner.value).toBe(false);
      t.clock.advance(2000);
      await install.load();
      expect(install.showBanner.value).toBe(i < 3);
    }
    t.clock.advance(365 * 86_400_000);
    await install.load();
    expect(install.showBanner.value).toBe(false);
  });

  it('picks install guidance from the prompt and the platform', async () => {
    /** @param {ConstructorParameters<typeof FakeInstallEnvironment>[0]} platform */
    const guidanceFor = async (platform) => {
      const t = await createTestStores({
        installEnvironment: new FakeInstallEnvironment(platform),
      });
      return t.stores.install.guidance.value;
    };
    expect(await guidanceFor({ os: 'ios', browser: 'safari' })).toBe('iosSafari');
    expect(await guidanceFor({ os: 'ios', browser: 'chromium' })).toBe('iosOtherBrowser');
    expect(await guidanceFor({ os: 'desktop', browser: 'firefox' })).toBe('firefoxDesktop');
    expect(await guidanceFor({ os: 'android', browser: 'firefox' })).toBe('manual');
    expect(await guidanceFor({ os: 'desktop', browser: 'chromium' })).toBe('manual');

    const env = new FakeInstallEnvironment({ os: 'android', browser: 'chromium' });
    const t = await createTestStores({ installEnvironment: env });
    env.setPromptAvailable(true);
    expect(t.stores.install.canPrompt.value).toBe(true);
    expect(t.stores.install.guidance.value).toBe('prompt');
  });

  it('asks for persistent storage after the user accepts the install prompt', async () => {
    const env = new FakeInstallEnvironment();
    const t = await createTestStores({ installEnvironment: env });
    const { install } = t.stores;
    expect(install.persisted.value).toBe(false);
    expect(await install.install()).toBe('unavailable');
    expect(env.calls).not.toContain('persist');

    env.setPromptAvailable(true);
    env.userChoice = 'dismissed';
    expect(await install.install()).toBe('dismissed');
    expect(env.calls).not.toContain('persist');

    env.setPromptAvailable(true);
    env.userChoice = 'accepted';
    expect(await install.install()).toBe('accepted');
    expect(env.calls).toContain('persist');
    expect(install.persisted.value).toBe(true);
    expect(install.canPrompt.value).toBe(false);
  });

  it('asks for persistence again when the app gets installed', async () => {
    const env = new FakeInstallEnvironment({ os: 'desktop', browser: 'firefox' });
    const t = await createTestStores({ installEnvironment: env });
    env.fireInstalled();
    await t.stores.install.settled();
    await Promise.resolve();
    expect(t.stores.install.installed.value).toBe(true);
    expect(env.calls).toContain('persist');
  });

  it('protects storage silently only where no permission prompt appears', async () => {
    /**
     * @param {ConstructorParameters<typeof FakeInstallEnvironment>[0]} platform
     * @param {boolean} [standalone]
     */
    const silentPersist = async (platform, standalone = false) => {
      const env = new FakeInstallEnvironment(platform);
      env.standalone = standalone;
      const t = await createTestStores({ installEnvironment: env });
      await t.stores.install.protectSilently();
      return env.calls.includes('persist');
    };
    expect(await silentPersist({ browser: 'chromium' })).toBe(true);
    expect(await silentPersist({ os: 'ios', browser: 'safari' })).toBe(true);
    expect(await silentPersist({ browser: 'firefox' })).toBe(false);
    expect(await silentPersist({ browser: 'firefox' }, true)).toBe(true);

    const env = new FakeInstallEnvironment({ browser: 'chromium' });
    env.persistedValue = true;
    const t = await createTestStores({ installEnvironment: env });
    await t.stores.install.protectSilently();
    expect(env.calls).not.toContain('persist');
  });

  it('reports storage state, keeping a known answer when persist() is unsupported', async () => {
    const env = new FakeInstallEnvironment({ browser: 'firefox' });
    env.persistGrant = false;
    const t = await createTestStores({ installEnvironment: env });
    const { install } = t.stores;
    expect(install.usage.value).toBe(2_500_000);
    expect(install.quota.value).toBe(1_000_000_000);
    await install.requestPersistence();
    expect(install.persisted.value).toBe(false);

    env.persistGrant = null;
    env.persistedValue = true;
    await install.load();
    await install.requestPersistence();
    expect(install.persisted.value).toBe(true);

    env.estimateValue = null;
    await install.refreshEstimate();
    expect(install.usage.value).toBeNull();
  });

  it('hints at import and sync in a fresh home-screen app on iOS', async () => {
    const env = new FakeInstallEnvironment({ os: 'ios', browser: 'safari' });
    env.standalone = true;
    const t = await createTestStores({ installEnvironment: env });
    expect(t.stores.install.showFreshInstallHint.value).toBe(true);
    await addAccount(t);
    expect(t.stores.install.showFreshInstallHint.value).toBe(false);

    const desktop = await createTestStores();
    expect(desktop.stores.install.showFreshInstallHint.value).toBe(false);
  });

  it('stops listening after dispose()', async () => {
    const env = new FakeInstallEnvironment();
    const t = await createTestStores({ installEnvironment: env });
    t.stores.install.dispose();
    env.setStandalone(true);
    env.setPromptAvailable(true);
    expect(t.stores.install.installed.value).toBe(false);
    expect(t.stores.install.canPrompt.value).toBe(false);
  });
});
