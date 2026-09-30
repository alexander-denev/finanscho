/**
 * @typedef {object} Debounced
 * @property {() => void} trigger schedule a call, restarting the wait
 * @property {() => void} cancel drop a pending call
 * @property {() => boolean} isPending whether a call is scheduled
 */

/**
 * Creates a trailing-edge debouncer around a zero-argument function.
 * @param {() => void} fn
 * @param {number} waitMs
 * @param {{ setTimeout: typeof setTimeout, clearTimeout: typeof clearTimeout }} [timers]
 * @returns {Debounced}
 */
export function debounce(fn, waitMs, timers = globalThis) {
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let handle;
  return {
    trigger() {
      if (handle !== undefined) timers.clearTimeout(handle);
      handle = timers.setTimeout(() => {
        handle = undefined;
        fn();
      }, waitMs);
    },
    cancel() {
      if (handle !== undefined) timers.clearTimeout(handle);
      handle = undefined;
    },
    isPending() {
      return handle !== undefined;
    },
  };
}
