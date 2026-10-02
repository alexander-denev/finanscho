import { computed, signal } from '@preact/signals-core';
import { addMonthsToYearMonth, yearMonthOf } from '../core/domain/localDate.js';
import { createLoadState } from './loadState.js';

/** @typedef {import('../core/services/BudgetService.js').BudgetService} BudgetService */
/** @typedef {import('../core/services/BudgetService.js').MonthBudgets} MonthBudgets */
/** @typedef {import('../core/ports/clock.js').Clock} Clock */
/** @typedef {import('../core/ports/changeFeed.js').ChangedEntity} ChangedEntity */

/**
 * @template T
 * @typedef {import('@preact/signals-core').ReadonlySignal<T>} ReadonlySignal
 */

/** @typedef {{ currency: string, limitMinor: number, spentMinor: number }} BudgetTotals */

/** Budgets for the selected month. */
export class BudgetsStore {
  /** @type {ReadonlyArray<ChangedEntity>} */
  static DEPENDS_ON = ['budgets', 'categories', 'transactions', 'accounts'];

  #service;
  #month;
  #data = signal(/** @type {MonthBudgets | null} */ (null));
  #load = createLoadState();
  #totals = computed(() => {
    /** @type {Map<string, BudgetTotals>} */
    const totals = new Map();
    for (const { budget, progress } of this.#data.value?.lines ?? []) {
      const entry = totals.get(budget.currency) ?? {
        currency: budget.currency,
        limitMinor: 0,
        spentMinor: 0,
      };
      entry.limitMinor += progress.limitMinor;
      entry.spentMinor += progress.spentMinor;
      totals.set(budget.currency, entry);
    }
    return [...totals.values()];
  });

  /** @param {{ budgetService: BudgetService, clock: Clock }} deps */
  constructor({ budgetService, clock }) {
    this.#service = budgetService;
    this.#month = signal(yearMonthOf(clock.today()));
  }

  /** @returns {ReadonlySignal<string>} the selected month, 'YYYY-MM' */
  get month() {
    return this.#month;
  }

  /** @returns {ReadonlySignal<MonthBudgets | null>} */
  get data() {
    return this.#data;
  }

  /** @returns {ReadonlySignal<BudgetTotals[]>} limit and spending totals per currency */
  get totals() {
    return this.#totals;
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
    const month = this.#month.value;
    return this.#load.run(
      () => this.#service.forMonth(month),
      (data) => {
        this.#data.value = data;
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
   * @param {string} month 'YYYY-MM'
   * @returns {Promise<void>}
   */
  setMonth(month) {
    this.#month.value = month;
    return this.load();
  }

  /**
   * Moves the selected month by `delta` months.
   * @param {number} delta
   * @returns {Promise<void>}
   */
  shiftMonth(delta) {
    return this.setMonth(addMonthsToYearMonth(this.#month.value, delta));
  }

  /**
   * Sets the limit for a category in the selected month.
   * @param {string} categoryId
   * @param {string} limit user-typed amount
   * @param {boolean} [recurring] repeat in every following month
   * @returns {Promise<void>}
   */
  async setBudget(categoryId, limit, recurring = false) {
    await this.#service.set({ categoryId, month: this.#month.value, limit, recurring });
  }

  /**
   * @param {string} budgetId
   * @returns {Promise<void>}
   */
  removeBudget(budgetId) {
    return this.#service.remove(budgetId);
  }

  /** @returns {Promise<number>} how many budgets were copied */
  copyPreviousMonth() {
    return this.#service.copyFromPreviousMonth(this.#month.value);
  }

  /**
   * Carries recurring budgets into the months up to the current one.
   * @returns {Promise<number>}
   */
  materialize() {
    return this.#service.materialize();
  }
}
