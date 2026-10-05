import { debounce } from '../shared/debounce.js';

/** Quiet time after the last local transaction change before automations run. */
export const AUTOMATION_RUN_DELAY_MS = 300;

/**
 * Runs automations shortly after the user records or edits transactions on this device, so "a
 * transaction is recorded" reacts right away. Changes pulled from other devices are handled after
 * the pull instead. A run that writes something publishes a local change itself, which schedules
 * one more run; that one finds nothing new and writes nothing, so the loop ends.
 * @param {import('../core/ports/changeFeed.js').ChangeFeed} changeFeed
 * @param {() => Promise<unknown>} run
 * @param {{ waitMs?: number, timers?: { setTimeout: typeof setTimeout, clearTimeout: typeof clearTimeout } }} [options]
 * @returns {() => void} stop
 */
export function runAutomationsOnChange(changeFeed, run, options = {}) {
  const runner = debounce(
    () => {
      // A failed run changes nothing; the next change, pull, or midnight runs again.
      run().catch(() => {});
    },
    options.waitMs ?? AUTOMATION_RUN_DELAY_MS,
    options.timers,
  );
  const unsubscribe = changeFeed.subscribe((event) => {
    if (event.source === 'local' && event.entities.includes('transactions')) runner.trigger();
  });
  return () => {
    unsubscribe();
    runner.cancel();
  };
}
