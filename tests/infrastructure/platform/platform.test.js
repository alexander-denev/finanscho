import { describe, expect, it } from 'vitest';
import { detectPlatform } from '../../../src/infrastructure/platform/platform.js';

const UA = {
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0.6668.69 Mobile/15E148 Safari/604.1',
  iphoneFirefox:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/131.0 Mobile/15E148 Safari/605.1.15',
  ipadDesktopMode:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
  androidFirefox: 'Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0',
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  windowsFirefox:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0',
  windowsEdge:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0',
};

describe('detectPlatform', () => {
  it('detects iOS browsers from the user agent', () => {
    expect(detectPlatform({ userAgent: UA.iphoneSafari })).toEqual({
      os: 'ios',
      browser: 'safari',
    });
    expect(detectPlatform({ userAgent: UA.iphoneChrome })).toEqual({
      os: 'ios',
      browser: 'chromium',
    });
    expect(detectPlatform({ userAgent: UA.iphoneFirefox })).toEqual({
      os: 'ios',
      browser: 'firefox',
    });
  });

  it('tells an iPad in desktop mode from a Mac by touch support', () => {
    expect(detectPlatform({ userAgent: UA.ipadDesktopMode, maxTouchPoints: 5 })).toEqual({
      os: 'ios',
      browser: 'safari',
    });
    expect(detectPlatform({ userAgent: UA.macSafari, maxTouchPoints: 0 })).toEqual({
      os: 'desktop',
      browser: 'safari',
    });
  });

  it('detects Android and desktop browsers', () => {
    expect(detectPlatform({ userAgent: UA.androidChrome })).toEqual({
      os: 'android',
      browser: 'chromium',
    });
    expect(detectPlatform({ userAgent: UA.androidFirefox })).toEqual({
      os: 'android',
      browser: 'firefox',
    });
    expect(detectPlatform({ userAgent: UA.windowsFirefox })).toEqual({
      os: 'desktop',
      browser: 'firefox',
    });
    expect(detectPlatform({ userAgent: UA.windowsEdge })).toEqual({
      os: 'desktop',
      browser: 'chromium',
    });
  });

  it('prefers UA Client Hints when present', () => {
    expect(
      detectPlatform({
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64) reduced',
        userAgentData: { platform: 'Android', brands: [{ brand: 'Chromium' }] },
      }),
    ).toEqual({ os: 'android', browser: 'chromium' });
    expect(
      detectPlatform({
        userAgent: UA.windowsEdge,
        userAgentData: { platform: 'Windows', brands: [{ brand: 'Microsoft Edge' }] },
      }),
    ).toEqual({ os: 'desktop', browser: 'chromium' });
  });

  it('falls back to desktop/other when nothing is known', () => {
    expect(detectPlatform(undefined)).toEqual({ os: 'desktop', browser: 'other' });
    expect(detectPlatform({ userAgent: '' })).toEqual({ os: 'desktop', browser: 'other' });
  });
});
