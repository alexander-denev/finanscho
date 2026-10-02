import { signal } from '@preact/signals-core';
import { createLoadState } from './loadState.js';

/** @typedef {import('../core/services/RecurringService.js').RecurringService} RecurringService */
/** @typedef {import('../core/services/RecurringService.js').RuleSummary} RuleSummary */
/** @typedef {import('../core/services/RecurringService.js').UpcomingOccurrence} UpcomingOccurrence */
/** @typedef {import('../core/domain/recurringRule.js').RecurringRule} RecurringRule */
/** @typedef {import('../core/domain/recurringRule.js').RecurringRuleInput} RecurringRuleInput */
/** @typedef {import('../core/ports/changeFeed.js').ChangedEntity} ChangedEntity */

/**
 * @template T
 * @typedef {import('@preact/signals-core').ReadonlySignal<T>} ReadonlySignal
 */

/** Recurring rules and their upcoming occurrences. */
export class RecurringStore {
  /** @type {ReadonlyArray<ChangedEntity>} */
  static DEPENDS_ON = ['recurringRules'];

  #service;
  #rules = signal(/** @type {RuleSummary[]} */ ([]));
  #upcoming = signal(/** @type {UpcomingOccurrence[]} */ ([]));
  #load = createLoadState();

  /** @param {{ recurringService: RecurringService }} deps */
  constructor({ recurringService }) {
    this.#service = recurringService;
  }

  /** @returns {ReadonlySignal<RuleSummary[]>} */
  get rules() {
    return this.#rules;
  }

  /** @returns {ReadonlySignal<UpcomingOccurrence[]>} next 30 days */
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
      ([rules, upcoming]) => {
        this.#rules.value = rules;
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
   * @param {RecurringRuleInput} input
   * @returns {Promise<RecurringRule>}
   */
  create(input) {
    return this.#service.create(input);
  }

  /**
   * Changes a rule from the input's start date on: in place when only its dates change, else by
   * replacing it (the old rule ends the day before).
   * @param {string} ruleId
   * @param {RecurringRuleInput} input
   * @returns {Promise<RecurringRule>}
   */
  edit(ruleId, input) {
    return this.#service.edit(ruleId, input);
  }

  /**
   * @param {string} ruleId
   * @returns {Promise<void>}
   */
  stop(ruleId) {
    return this.#service.stop(ruleId);
  }

  /**
   * @param {string} ruleId
   * @returns {Promise<string>} the next occurrence date
   */
  resume(ruleId) {
    return this.#service.resume(ruleId);
  }

  /**
   * @param {string} ruleId
   * @returns {Promise<void>}
   */
  remove(ruleId) {
    return this.#service.remove(ruleId);
  }

  /**
   * Creates occurrences that are due up to today.
   * @returns {Promise<number>}
   */
  materialize() {
    return this.#service.materialize();
  }
}
