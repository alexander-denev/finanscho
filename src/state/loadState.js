import { batch, signal } from '@preact/signals-core';

/** @typedef {'idle' | 'loading' | 'error'} LoadStatus */

/**
 * @template T
 * @typedef {object} LoadState
 * @property {import('@preact/signals-core').ReadonlySignal<LoadStatus>} status
 * @property {import('@preact/signals-core').ReadonlySignal<unknown>} error the last load error, or null
 * @property {(load: () => Promise<T>, apply: (result: T) => void) => Promise<void>} run runs a load; results of superseded runs are dropped
 * @property {() => Promise<void>} settled resolves when the latest run has finished
 */

/**
 * Status/error signals plus a runner that ignores out-of-order results, shared by all stores.
 * Each store keeps the returned object in a private field.
 * @template T
 * @returns {LoadState<T>}
 */
export function createLoadState() {
  const status = signal(/** @type {LoadStatus} */ ('idle'));
  const error = signal(/** @type {unknown} */ (null));
  let latest = 0;
  /** @type {Promise<void>} */
  let pending = Promise.resolve();

  return {
    status,
    error,
    run(load, apply) {
      latest += 1;
      const ticket = latest;
      status.value = 'loading';
      pending = load().then(
        (result) => {
          if (ticket !== latest) return;
          batch(() => {
            apply(result);
            status.value = 'idle';
            error.value = null;
          });
        },
        (failure) => {
          if (ticket !== latest) return;
          batch(() => {
            status.value = 'error';
            error.value = failure;
          });
        },
      );
      return pending;
    },
    async settled() {
      let current;
      do {
        current = pending;
        await current;
      } while (current !== pending);
    },
  };
}
