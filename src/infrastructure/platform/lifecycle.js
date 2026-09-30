import { App } from '@capacitor/app';
import { isNative } from './platform.js';

/**
 * Subscribes to foreground/background changes: Capacitor `appStateChange` on native, the page
 * `visibilitychange` event on the web.
 * @param {(active: boolean) => void} listener
 * @returns {() => void} unsubscribe
 */
function onActiveChange(listener) {
  if (isNative()) {
    const handle = App.addListener('appStateChange', ({ isActive }) => listener(isActive));
    return () => {
      void handle.then((h) => h.remove());
    };
  }
  const handler = () => listener(document.visibilityState === 'visible');
  document.addEventListener('visibilitychange', handler);
  return () => document.removeEventListener('visibilitychange', handler);
}

/**
 * Calls `listener` when the app returns to the foreground.
 * @param {() => void} listener
 * @returns {() => void} unsubscribe
 */
export function onAppResume(listener) {
  return onActiveChange((active) => {
    if (active) listener();
  });
}

/**
 * Calls `listener` when the app goes to the background.
 * @param {() => void} listener
 * @returns {() => void} unsubscribe
 */
export function onAppPause(listener) {
  return onActiveChange((active) => {
    if (!active) listener();
  });
}
