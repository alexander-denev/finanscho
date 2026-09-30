import { computed, signal } from '@preact/signals-core';
import { createLoadState } from './loadState.js';

/** @typedef {import('../core/domain/account.js').Account} Account */
/** @typedef {import('../core/domain/account.js').AccountInput} AccountInput */
/** @typedef {import('../core/services/AccountService.js').AccountService} AccountService */
/** @typedef {import('../core/services/AccountService.js').AccountBalance} AccountBalance */
/** @typedef {import('../core/ports/changeFeed.js').ChangedEntity} ChangedEntity */
/** @typedef {{ currency: string, amountMinor: number }} CurrencyTotal */

/**
 * @template T
 * @typedef {import('@preact/signals-core').ReadonlySignal<T>} ReadonlySignal
 */

/** Accounts with derived balances. */
export class AccountsStore {
  /** @type {ReadonlyArray<ChangedEntity>} */
  static DEPENDS_ON = ['accounts', 'transactions'];

  #service;
  #items = signal(/** @type {AccountBalance[]} */ ([]));
  #load = createLoadState();
  #active = computed(() => this.#items.value.filter((i) => !i.account.archived));
  #archived = computed(() => this.#items.value.filter((i) => i.account.archived));
  #byId = computed(() => new Map(this.#items.value.map((i) => [i.account.id, i.account])));
  #totals = computed(() => {
    /** @type {Map<string, number>} */
    const totals = new Map();
    for (const { account, balanceMinor } of this.#active.value) {
      totals.set(account.currency, (totals.get(account.currency) ?? 0) + balanceMinor);
    }
    return [...totals.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([currency, amountMinor]) => ({ currency, amountMinor }));
  });

  /** @param {{ accountService: AccountService }} deps */
  constructor({ accountService }) {
    this.#service = accountService;
  }

  /** @returns {ReadonlySignal<AccountBalance[]>} every account including archived */
  get items() {
    return this.#items;
  }

  /** @returns {ReadonlySignal<AccountBalance[]>} */
  get active() {
    return this.#active;
  }

  /** @returns {ReadonlySignal<AccountBalance[]>} */
  get archived() {
    return this.#archived;
  }

  /** @returns {ReadonlySignal<Map<string, Account>>} */
  get byId() {
    return this.#byId;
  }

  /** @returns {ReadonlySignal<CurrencyTotal[]>} totals of active accounts per currency */
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
    return this.#load.run(
      () => this.#service.listWithBalances({ includeArchived: true }),
      (items) => {
        this.#items.value = items;
      },
    );
  }

  /**
   * Reloads after a data change.
   * @returns {Promise<void>}
   */
  invalidate() {
    return this.load();
  }

  /** @returns {Promise<void>} resolves when pending reloads finish */
  settled() {
    return this.#load.settled();
  }

  /**
   * @param {AccountInput} input
   * @returns {Promise<Account>}
   */
  create(input) {
    return this.#service.create(input);
  }

  /**
   * @param {string} id
   * @param {AccountInput} input
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
}
