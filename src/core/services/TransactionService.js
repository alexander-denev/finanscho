import { createTransaction, normalizeTransactionInput } from '../domain/transaction.js';
import { NotFoundError } from '../errors.js';
import { SETTING_KEYS } from './SettingsService.js';

/** @typedef {import('../domain/transaction.js').Transaction} Transaction */
/** @typedef {import('../domain/transaction.js').TransactionInput} TransactionInput */
/** @typedef {import('../domain/transaction.js').TransactionRefs} TransactionRefs */
/** @typedef {import('../ports/repositories.js').TransactionQuery} TransactionQuery */
/** @typedef {import('../ports/repositories.js').AccountRepository} AccountRepository */
/** @typedef {import('../ports/repositories.js').CategoryRepository} CategoryRepository */
/** @typedef {import('../ports/repositories.js').TransactionRepository} TransactionRepository */
/** @typedef {import('../ports/repositories.js').SettingsRepository} SettingsRepository */
/** @typedef {import('../ports/clock.js').Clock} Clock */
/** @typedef {import('../ports/idGenerator.js').IdGenerator} IdGenerator */

/** Fields a user can edit on a transaction. */
const EDITABLE_FIELDS = /** @type {const} */ ([
  'kind',
  'date',
  'amountMinor',
  'accountId',
  'toAccountId',
  'categoryId',
  'payee',
  'note',
]);

/** How many distinct payees are suggested at most. */
export const PAYEE_SUGGESTION_LIMIT = 200;

/** Use cases for transactions. */
export class TransactionService {
  #transactions;
  #accounts;
  #categories;
  #settings;
  #clock;
  #ids;

  /**
   * @param {{ transactions: TransactionRepository, accounts: AccountRepository, categories: CategoryRepository, settings: SettingsRepository, clock: Clock, ids: IdGenerator }} deps
   */
  constructor({ transactions, accounts, categories, settings, clock, ids }) {
    this.#transactions = transactions;
    this.#accounts = accounts;
    this.#categories = categories;
    this.#settings = settings;
    this.#clock = clock;
    this.#ids = ids;
  }

  /**
   * @param {TransactionQuery} query
   * @returns {Promise<{ items: Transaction[], hasMore: boolean }>}
   */
  query(query) {
    return this.#transactions.query(query);
  }

  /**
   * @param {string} id
   * @returns {Promise<Transaction>}
   * @throws {NotFoundError}
   */
  async get(id) {
    const transaction = await this.#transactions.get(id);
    if (!transaction) throw new NotFoundError('transaction', id);
    return transaction;
  }

  /**
   * Payees used before, most recent first, with the kind, category, and account of their latest
   * transaction (for autofill).
   * @returns {Promise<import('../ports/repositories.js').PayeeSuggestion[]>}
   */
  payeeSuggestions() {
    return this.#transactions.recentPayees(PAYEE_SUGGESTION_LIMIT);
  }

  /**
   * Looks up the entities an input refers to, for validation.
   * @param {Omit<TransactionInput, 'date'>} input
   * @returns {Promise<TransactionRefs>}
   */
  async resolveRefs(input) {
    const [account, toAccount, category] = await Promise.all([
      input.accountId ? this.#accounts.get(input.accountId) : null,
      input.toAccountId ? this.#accounts.get(input.toAccountId) : null,
      input.categoryId ? this.#categories.get(input.categoryId) : null,
    ]);
    return { account, toAccount, category };
  }

  /**
   * @param {TransactionInput} input
   * @returns {Promise<Transaction>}
   * @throws {import('../errors.js').ValidationError}
   */
  async create(input) {
    const fields = normalizeTransactionInput(input, await this.resolveRefs(input));
    const transaction = createTransaction(fields, {
      id: this.#ids.newId(),
      now: this.#clock.nowIso(),
    });
    await this.#transactions.create(transaction);
    await this.#settings.set(SETTING_KEYS.lastAccountId, transaction.accountId);
    return transaction;
  }

  /**
   * Writes only the fields that changed, so concurrent edits to other fields on another device
   * are preserved by the per-field merge.
   * @param {string} id
   * @param {TransactionInput} input
   * @returns {Promise<void>}
   */
  async update(id, input) {
    const existing = await this.get(id);
    const fields = normalizeTransactionInput(input, await this.resolveRefs(input));
    /** @type {Partial<Transaction>} */
    const changes = {};
    for (const field of EDITABLE_FIELDS) {
      if (fields[field] !== existing[field]) Object.assign(changes, { [field]: fields[field] });
    }
    if (Object.keys(changes).length === 0) return;
    await this.#transactions.update(id, { ...changes, updatedAt: this.#clock.nowIso() });
  }

  /**
   * @param {string} id
   * @returns {Promise<void>}
   */
  async remove(id) {
    await this.get(id);
    await this.#transactions.remove(id, this.#clock.nowIso());
  }

  /**
   * Defaults for a new transaction: today's date and the last used account when it is still
   * active (else the first active account).
   * @returns {Promise<{ date: string, accountId: string | null }>}
   */
  async defaults() {
    const [lastId, accounts] = await Promise.all([
      this.#settings.get(SETTING_KEYS.lastAccountId),
      this.#accounts.list(),
    ]);
    const last = accounts.find((a) => a.id === lastId);
    return { date: this.#clock.today(), accountId: last?.id ?? accounts[0]?.id ?? null };
  }
}
