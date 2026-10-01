import { describe, expect, it, vi } from 'vitest';
import { BrowserInstallEnvironment } from '../../../src/infrastructure/platform/BrowserInstallEnvironment.js';

const CHROME_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';

/**
 * A fake `window` with a controllable display-mode media query and `navigator`.
 * @param {{ standalone?: boolean, iosStandalone?: boolean, storage?: object, matchMedia?: boolean }} [options]
 */
function fakeWindow(options = {}) {
  const target = new EventTarget();
  const query = Object.assign(new EventTarget(), {
    matches: options.standalone ?? false,
    media: '(display-mode: standalone)',
  });
  const win = Object.assign(target, {
    navigator: {
      userAgent: CHROME_ANDROID,
      standalone: options.iosStandalone,
      storage: options.storage,
    },
    matchMedia: options.matchMedia === false ? undefined : () => query,
  });
  /** @param {boolean} matches */
  const setStandalone = (matches) => {
    query.matches = matches;
    query.dispatchEvent(new Event('change'));
  };
  return {
    window:
      /** @type {import('../../../src/infrastructure/platform/BrowserInstallEnvironment.js').InstallWindow & EventTarget} */ (
        /** @type {unknown} */ (win)
      ),
    setStandalone,
  };
}

/** @param {'accepted' | 'dismissed'} outcome */
function installPromptEvent(outcome) {
  const event = new Event('beforeinstallprompt', { cancelable: true });
  return Object.assign(event, {
    prompt: vi.fn(async () => {}),
    userChoice: Promise.resolve({ outcome }),
  });
}

describe('BrowserInstallEnvironment', () => {
  it('detects the platform and standalone display mode, including iOS home-screen apps', () => {
    const fake = fakeWindow();
    const env = new BrowserInstallEnvironment({ window: fake.window });
    expect(env.platform).toEqual({ os: 'android', browser: 'chromium' });
    expect(env.isStandalone()).toBe(false);
    const changes = /** @type {boolean[]} */ ([]);
    const off = env.onDisplayModeChange((standalone) => changes.push(standalone));
    fake.setStandalone(true);
    expect(env.isStandalone()).toBe(true);
    off();
    fake.setStandalone(false);
    expect(changes).toEqual([true]);

    const ios = new BrowserInstallEnvironment({
      window: fakeWindow({ iosStandalone: true }).window,
    });
    expect(ios.isStandalone()).toBe(true);
    const noMedia = new BrowserInstallEnvironment({
      window: fakeWindow({ matchMedia: false }).window,
    });
    expect(noMedia.isStandalone()).toBe(false);
    expect(() => noMedia.onDisplayModeChange(() => {})()).not.toThrow();
  });

  it('keeps the beforeinstallprompt event and shows it on demand, once', async () => {
    const fake = fakeWindow();
    const env = new BrowserInstallEnvironment({ window: fake.window });
    const availability = /** @type {boolean[]} */ ([]);
    env.onInstallAvailabilityChange((available) => availability.push(available));
    expect(env.canPromptInstall()).toBe(false);
    expect(await env.promptInstall()).toBe('unavailable');

    const event = installPromptEvent('accepted');
    fake.window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(env.canPromptInstall()).toBe(true);
    expect(await env.promptInstall()).toBe('accepted');
    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(env.canPromptInstall()).toBe(false);
    expect(availability).toEqual([true, false]);

    fake.window.dispatchEvent(installPromptEvent('dismissed'));
    expect(await env.promptInstall()).toBe('dismissed');
  });

  it('reports appinstalled and drops a pending prompt', () => {
    const fake = fakeWindow();
    const env = new BrowserInstallEnvironment({ window: fake.window });
    const installed = vi.fn();
    env.onInstalled(installed);
    fake.window.dispatchEvent(installPromptEvent('accepted'));
    fake.window.dispatchEvent(new Event('appinstalled'));
    expect(installed).toHaveBeenCalledTimes(1);
    expect(env.canPromptInstall()).toBe(false);

    env.dispose();
    fake.window.dispatchEvent(new Event('appinstalled'));
    fake.window.dispatchEvent(installPromptEvent('accepted'));
    expect(installed).toHaveBeenCalledTimes(1);
    expect(env.canPromptInstall()).toBe(false);
  });

  it('wraps navigator.storage and resolves null when unsupported or failing', async () => {
    const supported = new BrowserInstallEnvironment({
      window: fakeWindow({
        storage: {
          persisted: async () => false,
          persist: async () => true,
          estimate: async () => ({ usage: 1200, quota: 5000 }),
        },
      }).window,
    });
    expect(await supported.storage.persisted()).toBe(false);
    expect(await supported.storage.persist()).toBe(true);
    expect(await supported.storage.estimate()).toEqual({ usage: 1200, quota: 5000 });

    const missing = new BrowserInstallEnvironment({ window: fakeWindow().window });
    expect(await missing.storage.persisted()).toBeNull();
    expect(await missing.storage.persist()).toBeNull();
    expect(await missing.storage.estimate()).toBeNull();

    const failing = new BrowserInstallEnvironment({
      window: fakeWindow({
        storage: {
          persisted: async () => {
            throw new Error('blocked');
          },
          estimate: async () => ({}),
        },
      }).window,
    });
    expect(await failing.storage.persisted()).toBeNull();
    expect(await failing.storage.persist()).toBeNull();
    expect(await failing.storage.estimate()).toBeNull();
  });
});
