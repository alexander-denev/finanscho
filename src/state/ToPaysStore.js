import { signal } from '@preact/signals-core';
import { createLoadState } from './loadState.js';

/** @typedef {import('../core/services/ToPayService.js').ToPayService} ToPayService */
/** @typedef {import('../core/domain/toPay.js').ToPay} ToPay */
/** @typedef {import('../core/domain/toPay.js').ToPayInput} ToPayInput */
/** @typedef {import('../core/domain/transaction.js').Transaction} Transaction */
/** @typedef {import('../core/ports/changeFeed.js').ChangedEntity} ChangedEntity */

/**
 * @template T
 * @typedef {import('@preact/signals-core').ReadonlySignal<T>} ReadonlySignal
 */

/** Payments still to make by hand (docs/DECISIONS.md, D58). */
export class ToPaysStore {
  /** @type {ReadonlyArray<ChangedEntity>} */
  static DEPENDS_ON = ['toPays'];

  #service;
  #items = signal(/** @type {ToPay[]} */ ([]));
  #load = createLoadState();

  /** @param {{ toPayService: ToPayService }} deps */
  constructor({ toPayService }) {
    this.#service = toPayService;
  }

  /** @returns {ReadonlySignal<ToPay[]>} soonest due first, then those without a due date */
  get items() {
    return this.#items;
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
      () => this.#service.list(),
      (items) => {
        this.#items.value = items;
      },
    );
  }

  /**
   * Also called at local midnight, so the days left are counted from the new day.
   * @returns {Promise<void>}
   */
  invalidate() {
    return this.load();
  }

  /** @returns {Promise<void>} */
  settled() {
    return this.#load.settled();
  }

  /**
   * @param {string} id
   * @returns {Promise<ToPay>}
   */
  get(id) {
    return this.#service.get(id);
  }

  /**
   * @param {ToPayInput} input
   * @returns {Promise<ToPay>}
   */
  create(input) {
    return this.#service.create(input);
  }

  /**
   * @param {string} id
   * @param {ToPayInput} input
   * @returns {Promise<void>}
   */
  edit(id, input) {
    return this.#service.edit(id, input);
  }

  /**
   * @param {string} id
   * @returns {Promise<void>}
   */
  remove(id) {
    return this.#service.remove(id);
  }

  /**
   * Records the To pay's transaction, dated today, and deletes the To pay.
   * @param {string} id
   * @returns {Promise<Transaction>}
   */
  pay(id) {
    return this.#service.pay(id);
  }
}
