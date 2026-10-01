/**
 * Subscribes to foreground/background changes through the page `visibilitychange` event.
 * @param {(active: boolean) => void} listener
 * @returns {() => void} unsubscribe
 */
function onActiveChange(listener) {
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
