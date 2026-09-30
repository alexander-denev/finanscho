import { batch, computed, signal } from '@preact/signals-core';
import { balanceEffect } from '../core/domain/transaction.js';
import { createLoadState } from './loadState.js';

/** @typedef {import('../core/domain/transaction.js').Transaction} Transaction */
/** @typedef {import('../core/domain/transaction.js').TransactionInput} TransactionInput */
/** @typedef {import('../core/services/TransactionService.js').TransactionService} TransactionService */
/** @typedef {import('../core/ports/changeFeed.js').ChangedEntity} ChangedEntity */
/** @typedef {import('./AccountsStore.js').AccountsStore} AccountsStore */
/** @typedef {{ currency: string, amountMinor: number }} CurrencyTotal */

/**
 * @template T
 * @typedef {import('@preact/signals-core').ReadonlySignal<T>} ReadonlySignal
 */

/**
 * @typedef {object} TransactionFilter
 * @property {string | null} accountId
 * @property {string | null} categoryId
 * @property {string | null} month 'YYYY-MM'
 * @property {string} search
 */

/**
 * @typedef {object} DayGroup
 * @property {string} date
 * @property {Transaction[]} items
 * @property {CurrencyTotal[]} net signed net per currency (transfers count only when filtering by account)
 */

export const PAGE_SIZE = 50;

/** @type {TransactionFilter} */
const EMPTY_FILTER = { accountId: null, categoryId: null, month: null, search: '' };

/**
 * Adds a signed amount to per-currency totals.
 * @param {Map<string, number>} totals
 * @param {string | undefined} currency
 * @param {number} amount
 * @returns {void}
 */
function addTo(totals, currency, amount) {
  if (!currency || amount === 0) return;
  totals.set(currency, (totals.get(currency) ?? 0) + amount);
}

/**
 * @param {Map<string, number>} totals
 * @returns {CurrencyTotal[]}
 */
function toList(totals) {
  return [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, amountMinor]) => ({ currency, amountMinor }));
}

/** The filtered, paged transaction list. */
export class TransactionsStore {
  /** @type {ReadonlyArray<ChangedEntity>} */
  static DEPENDS_ON = ['transactions'];

  #service;
  #accounts;
  #filter = signal(EMPTY_FILTER);
  #limit = signal(PAGE_SIZE);
  #items = signal(/** @type {Transaction[]} */ ([]));
  #hasMore = signal(false);
  #load = createLoadState();

  /**
   * Signed effect of a transaction in the current view.
   * @param {Transaction} tx
   * @returns {number}
   */
  #effect(tx) {
    const accountId = this.#filter.value.accountId;
    if (accountId) return balanceEffect(tx, accountId);
    if (tx.kind === 'income') return tx.amountMinor;
    if (tx.kind === 'expense') return -tx.amountMinor;
    return 0;
  }

  #days = computed(() => {
    const byId = this.#accounts.byId.value;
    /** @type {Map<string, { items: Transaction[], net: Map<string, number> }>} */
    const groups = new Map();
    for (const tx of this.#items.value) {
      const group = groups.get(tx.date) ?? {
        items: /** @type {Transaction[]} */ ([]),
        net: /** @type {Map<string, number>} */ (new Map()),
      };
      group.items.push(tx);
      addTo(group.net, byId.get(tx.accountId)?.currency, this.#effect(tx));
      groups.set(tx.date, group);
    }
    return [...groups.entries()].map(([date, g]) => ({ date, items: g.items, net: toList(g.net) }));
  });

  #total = computed(() => {
    const byId = this.#accounts.byId.value;
    /** @type {Map<string, number>} */
    const totals = new Map();
    for (const tx of this.#items.value)
      addTo(totals, byId.get(tx.accountId)?.currency, this.#effect(tx));
    return toList(totals);
  });

  /**
   * @param {{ transactionService: TransactionService, accountsStore: AccountsStore }} deps
   */
  constructor({ transactionService, accountsStore }) {
    this.#service = transactionService;
    this.#accounts = accountsStore;
  }

  /** @returns {ReadonlySignal<TransactionFilter>} */
  get filter() {
    return this.#filter;
  }

  /** @returns {ReadonlySignal<Transaction[]>} loaded page(s), newest first */
  get items() {
    return this.#items;
  }

  /** @returns {ReadonlySignal<boolean>} */
  get hasMore() {
    return this.#hasMore;
  }

  /** @returns {ReadonlySignal<DayGroup[]>} */
  get days() {
    return this.#days;
  }

  /** @returns {ReadonlySignal<CurrencyTotal[]>} net of the loaded transactions per currency */
  get total() {
    return this.#total;
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
    const { accountId, categoryId, month, search } = this.#filter.value;
    const query = {
      limit: this.#limit.value,
      ...(accountId ? { accountId } : {}),
      ...(categoryId ? { categoryId } : {}),
      ...(month ? { month } : {}),
      ...(search.trim() ? { search } : {}),
    };
    return this.#load.run(
      () => this.#service.query(query),
      (result) => {
        this.#items.value = result.items;
        this.#hasMore.value = result.hasMore;
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
   * Changes the filter and reloads the first page.
   * @param {Partial<TransactionFilter>} changes
   * @returns {Promise<void>}
   */
  setFilter(changes) {
    batch(() => {
      this.#filter.value = { ...this.#filter.value, ...changes };
      this.#limit.value = PAGE_SIZE;
    });
    return this.load();
  }

  /** @returns {Promise<void>} */
  clearFilter() {
    return this.setFilter(EMPTY_FILTER);
  }

  /**
   * Loads one more page.
   * @returns {Promise<void>}
   */
  loadMore() {
    this.#limit.value = this.#limit.value + PAGE_SIZE;
    return this.load();
  }

  /**
   * @param {string} id
   * @returns {Promise<Transaction>}
   */
  get(id) {
    return this.#service.get(id);
  }

  /**
   * Creates a transaction, or updates it when `id` is given.
   * @param {TransactionInput} input
   * @param {string | null} [id]
   * @returns {Promise<void>}
   */
  async save(input, id = null) {
    if (id) await this.#service.update(id, input);
    else await this.#service.create(input);
  }

  /**
   * @param {string} id
   * @returns {Promise<void>}
   */
  remove(id) {
    return this.#service.remove(id);
  }

  /** @returns {Promise<{ date: string, accountId: string | null }>} */
  defaults() {
    return this.#service.defaults();
  }
}
