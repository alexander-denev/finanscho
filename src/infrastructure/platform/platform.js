/**
 * Browser and operating-system detection. Used only for the default device name and for install
 * instructions, never to switch features on or off (feature-detect instead).
 */

/** @typedef {'ios' | 'android' | 'desktop'} PlatformOs */
/** @typedef {'safari' | 'chromium' | 'firefox' | 'other'} PlatformBrowser */

/**
 * @typedef {object} Platform
 * @property {PlatformOs} os
 * @property {PlatformBrowser} browser
 */

/**
 * The parts of `navigator` that detection reads. `userAgentData` (UA Client Hints) exists only in
 * Chromium browsers.
 * @typedef {object} NavigatorLike
 * @property {string} [userAgent]
 * @property {number} [maxTouchPoints]
 * @property {{ platform?: string, brands?: ReadonlyArray<{ brand: string }> }} [userAgentData]
 */

/**
 * @param {string} ua
 * @param {number} maxTouchPoints
 * @returns {PlatformOs}
 */
function osFromUserAgent(ua, maxTouchPoints) {
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios';
  // iPadOS requests desktop sites with a Mac user agent; only touch support gives it away.
  if (/Macintosh/.test(ua) && maxTouchPoints > 1) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

/**
 * @param {string} ua
 * @returns {PlatformBrowser}
 */
function browserFromUserAgent(ua) {
  if (/Firefox\/|FxiOS\//.test(ua)) return 'firefox';
  if (/Chrome\/|Chromium\/|CriOS\/|Edg\/|EdgiOS\//.test(ua)) return 'chromium';
  if (/OPiOS\/|YaBrowser\/|GSA\//.test(ua)) return 'other';
  if (/Safari\//.test(ua)) return 'safari';
  return 'other';
}

/**
 * Detects the operating system and browser family, preferring UA Client Hints and falling back to
 * the user-agent string.
 * @param {NavigatorLike | undefined} nav usually `window.navigator`
 * @returns {Platform}
 */
export function detectPlatform(nav) {
  const ua = nav?.userAgent ?? '';
  const hints = nav?.userAgentData;
  const fromUa = osFromUserAgent(ua, nav?.maxTouchPoints ?? 0);
  if (hints && typeof hints.platform === 'string' && hints.platform !== '') {
    const os = /android/i.test(hints.platform)
      ? 'android'
      : /ios/i.test(hints.platform)
        ? 'ios'
        : 'desktop';
    const chromium = (hints.brands ?? []).some((b) => /Chromium|Google Chrome/.test(b.brand));
    return { os, browser: chromium ? 'chromium' : browserFromUserAgent(ua) };
  }
  return { os: fromUa, browser: browserFromUserAgent(ua) };
}
