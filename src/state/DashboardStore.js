import { signal } from '@preact/signals-core';
import { createLoadState } from './loadState.js';

/** @typedef {import('../core/services/DashboardService.js').DashboardService} DashboardService */
/** @typedef {import('../core/services/DashboardService.js').DashboardSummary} DashboardSummary */
/** @typedef {import('../core/ports/changeFeed.js').ChangedEntity} ChangedEntity */

/**
 * @template T
 * @typedef {import('@preact/signals-core').ReadonlySignal<T>} ReadonlySignal
 */

/** Dashboard aggregates. */
export class DashboardStore {
  /** @type {ReadonlyArray<ChangedEntity>} */
  static DEPENDS_ON = ['accounts', 'categories', 'transactions', 'budgets', 'automations'];

  #service;
  #summary = signal(/** @type {DashboardSummary | null} */ (null));
  #load = createLoadState();

  /** @param {{ dashboardService: DashboardService }} deps */
  constructor({ dashboardService }) {
    this.#service = dashboardService;
  }

  /** @returns {ReadonlySignal<DashboardSummary | null>} */
  get summary() {
    return this.#summary;
  }

  /** @returns {ReadonlySignal<import('./loadState.js').LoadStatus>} */
  get status() {
    return this.#load.status;
  }

  /** @returns {ReadonlySignal<unknown>} */
  get error() {
    return this.#load.error;
  }

  /** @returns {Promise<void>} */
  load() {
    return this.#load.run(
      () => this.#service.summary(),
      (summary) => {
        this.#summary.value = summary;
      },
    );
  }

  /** @returns {Promise<void>} */
  invalidate() {
    return this.load();
  }

  /** @returns {Promise<void>} */
  settled() {
    return this.#load.settled();
  }
}
