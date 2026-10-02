import { computed, signal } from '@preact/signals-core';
import { createLoadState } from './loadState.js';

/** @typedef {import('../core/domain/category.js').Category} Category */
/** @typedef {import('../core/domain/category.js').CategoryInput} CategoryInput */
/** @typedef {import('../core/services/CategoryService.js').CategoryService} CategoryService */
/** @typedef {import('../core/ports/changeFeed.js').ChangedEntity} ChangedEntity */

/**
 * @template T
 * @typedef {import('@preact/signals-core').ReadonlySignal<T>} ReadonlySignal
 */

/** Income and expense categories. */
export class CategoriesStore {
  /** @type {ReadonlyArray<ChangedEntity>} */
  static DEPENDS_ON = ['categories'];

  #service;
  #all = signal(/** @type {Category[]} */ ([]));
  #load = createLoadState();
  #active = computed(() => this.#all.value.filter((c) => !c.archived));
  #expense = computed(() => this.#active.value.filter((c) => c.kind === 'expense'));
  #income = computed(() => this.#active.value.filter((c) => c.kind === 'income'));
  #byId = computed(() => new Map(this.#all.value.map((c) => [c.id, c])));

  /** @param {{ categoryService: CategoryService }} deps */
  constructor({ categoryService }) {
    this.#service = categoryService;
  }

  /** @returns {ReadonlySignal<Category[]>} every category including archived */
  get all() {
    return this.#all;
  }

  /** @returns {ReadonlySignal<Category[]>} */
  get active() {
    return this.#active;
  }

  /** @returns {ReadonlySignal<Category[]>} active expense categories */
  get expense() {
    return this.#expense;
  }

  /** @returns {ReadonlySignal<Category[]>} active income categories */
  get income() {
    return this.#income;
  }

  /** @returns {ReadonlySignal<Map<string, Category>>} */
  get byId() {
    return this.#byId;
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
      () => this.#service.list({ includeArchived: true }),
      (all) => {
        this.#all.value = all;
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
   * @param {CategoryInput} input
   * @returns {Promise<Category>}
   */
  create(input) {
    return this.#service.create(input);
  }

  /**
   * @param {string} id
   * @param {CategoryInput} input
   * @returns {Promise<void>}
   */
  update(id, input) {
    return this.#service.update(id, input);
  }

  /**
   * @param {string} id
   * @param {boolean} archived
   * @returns {Promise<void>}
   */
  setArchived(id, archived) {
    return this.#service.setArchived(id, archived);
  }

  /**
   * @param {string} id
   * @returns {Promise<boolean>} whether the category can be deleted (nothing uses it)
   */
  async canRemove(id) {
    return !(await this.#service.isInUse(id));
  }

  /**
   * @param {string} id
   * @returns {Promise<void>}
   */
  remove(id) {
    return this.#service.remove(id);
  }
}
