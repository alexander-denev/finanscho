import { signal } from '@preact/signals-core';

/**
 * @template T
 * @typedef {import('@preact/signals-core').ReadonlySignal<T>} ReadonlySignal
 */

/**
 * A short confirmation or error message. `key` is an i18n key, rendered by the UI.
 * @typedef {object} Toast
 * @property {number} id
 * @property {string} key
 * @property {Record<string, string | number>} params
 * @property {'info' | 'error'} tone
 */

export const TOAST_MS = 4_000;

/** Transient messages shown by the toast region. */
export class ToastStore {
  #toasts = signal(/** @type {Toast[]} */ ([]));
  // Toasts never load anything; status and error exist for the uniform store contract.
  #status = signal(/** @type {import('./loadState.js').LoadStatus} */ ('idle'));
  #error = signal(/** @type {unknown} */ (null));
  #nextId = 1;
  #timers;

  /**
   * @param {{ timers?: { setTimeout: typeof setTimeout } }} [deps]
   */
  constructor(deps = {}) {
    this.#timers = deps.timers ?? globalThis;
  }

  /** @returns {ReadonlySignal<Toast[]>} */
  get toasts() {
    return this.#toasts;
  }

  /** @returns {ReadonlySignal<import('./loadState.js').LoadStatus>} always 'idle' */
  get status() {
    return this.#status;
  }

  /** @returns {ReadonlySignal<unknown>} always null */
  get error() {
    return this.#error;
  }

  /**
   * Shows a message that dismisses itself after a few seconds.
   * @param {string} key i18n key
   * @param {Record<string, string | number>} [params]
   * @param {'info' | 'error'} [tone]
   * @returns {number} toast id
   */
  show(key, params = {}, tone = 'info') {
    const id = this.#nextId;
    this.#nextId += 1;
    this.#toasts.value = [...this.#toasts.value, { id, key, params, tone }];
    this.#timers.setTimeout(() => this.dismiss(id), TOAST_MS);
    return id;
  }

  /**
   * @param {number} id
   * @returns {void}
   */
  dismiss(id) {
    this.#toasts.value = this.#toasts.value.filter((t) => t.id !== id);
  }
}
