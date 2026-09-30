/**
 * Calls `listener` at every local midnight while the app is open. Timers are re-armed after each
 * firing (so DST changes are handled) and after the device wakes (timers may fire late).
 * @param {() => void} listener
 * @param {{ now?: () => Date }} [options]
 * @returns {() => void} cancel
 */
export function onLocalMidnight(listener, options = {}) {
  const now = options.now ?? (() => new Date());
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let handle;
  const arm = () => {
    const current = now();
    const next = new Date(
      current.getFullYear(),
      current.getMonth(),
      current.getDate() + 1,
      0,
      0,
      1,
    );
    handle = setTimeout(() => {
      listener();
      arm();
    }, next.getTime() - current.getTime());
  };
  arm();
  return () => clearTimeout(handle);
}
