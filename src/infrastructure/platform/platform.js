import { Capacitor } from '@capacitor/core';

/**
 * Whether the app runs inside a Capacitor native shell (Android or iOS).
 * @returns {boolean}
 */
export function isNative() {
  return Capacitor.isNativePlatform();
}

/**
 * @returns {'android' | 'ios' | 'web'}
 */
export function getPlatformName() {
  const platform = Capacitor.getPlatform();
  return platform === 'android' || platform === 'ios' ? platform : 'web';
}
