import { signal } from '@preact/signals-core';
import { createLoadState } from './loadState.js';

/** @typedef {import('../core/services/AutomationService.js').AutomationService} AutomationService */
/** @typedef {import('../core/services/AutomationService.js').AutomationSummary} AutomationSummary */
/** @typedef {import('../core/services/AutomationService.js').UpcomingItem} UpcomingItem */
/** @typedef {import('../core/services/AutomationService.js').AutomationPreview} AutomationPreview */
/** @typedef {import('../core/domain/automation.js').Automation} Automation */
/** @typedef {import('../core/domain/automation.js').AutomationInput} AutomationInput */
/** @typedef {import('../core/domain/transaction.js').Transaction} Transaction */
/** @typedef {import('../core/domain/budget.js').Budget} Budget */
/** @typedef {import('../core/ports/changeFeed.js').ChangedEntity} ChangedEntity */

/**
 * @template T
 * @typedef {import('@preact/signals-core').ReadonlySignal<T>} ReadonlySignal
 */

/** Automations ("When … If … Do …") and what their schedules will make soon. */
export class AutomationsStore {
  /**
   * Accounts and categories feed the "uses something archived" warning.
   * @type {ReadonlyArray<ChangedEntity>}
   */
  static DEPENDS_ON = ['automations', 'accounts', 'categories'];

  #service;
  #automations = signal(/** @type {AutomationSummary[]} */ ([]));
  #upcoming = signal(/** @type {UpcomingItem[]} */ ([]));
  #load = createLoadState();

  /** @param {{ automationService: AutomationService }} deps */
  constructor({ automationService }) {
    this.#service = automationService;
  }

  /** @returns {ReadonlySignal<AutomationSummary[]>} sorted by name */
  get automations() {
    return this.#automations;
  }

  /** @returns {ReadonlySignal<UpcomingItem[]>} next 30 days */
  get upcoming() {
    return this.#upcoming;
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
      () => Promise.all([this.#service.list(), this.#service.upcoming()]),
      ([automations, upcoming]) => {
        this.#automations.value = automations;
        this.#upcoming.value = upcoming;
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

  /**
   * @param {AutomationInput} input
   * @returns {Promise<Automation>}
   */
  create(input) {
    return this.#service.create(input);
  }

  /**
   * Changes take effect from today on; what the automation already made is not touched.
   * @param {string} id
   * @param {AutomationInput} input
   * @returns {Promise<Automation>}
   */
  edit(id, input) {
    return this.#service.edit(id, input);
  }

  /**
   * @param {string} id
   * @returns {Promise<void>}
   */
  stop(id) {
    return this.#service.stop(id);
  }

  /**
   * @param {string} id
   * @returns {Promise<void>}
   */
  resume(id) {
    return this.#service.resume(id);
  }

  /**
   * @param {string} id
   * @returns {Promise<void>}
   */
  remove(id) {
    return this.#service.remove(id);
  }

  /**
   * @param {string} id
   * @returns {Promise<{ transactions: number, budgets: number }>}
   */
  runNow(id) {
    return this.#service.runNow(id);
  }

  /**
   * @param {AutomationInput} input
   * @returns {Promise<AutomationPreview>}
   */
  preview(input) {
    return this.#service.preview(input);
  }

  /**
   * @param {string} id
   * @returns {Promise<{ transactions: Transaction[], budgets: Budget[] }>}
   */
  history(id) {
    return this.#service.history(id);
  }

  /**
   * @param {string} id
   * @returns {Promise<Automation | null>}
   */
  find(id) {
    return this.#service.find(id);
  }
}
