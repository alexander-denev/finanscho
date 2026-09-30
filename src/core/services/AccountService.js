import { accountEdits, createAccount } from '../domain/account.js';
import { NotFoundError } from '../errors.js';

/** @typedef {import('../domain/account.js').Account} Account */
/** @typedef {import('../domain/account.js').AccountInput} AccountInput */
/** @typedef {import('../ports/repositories.js').AccountRepository} AccountRepository */
/** @typedef {import('../ports/repositories.js').TransactionRepository} TransactionRepository */
/** @typedef {import('../ports/clock.js').Clock} Clock */
/** @typedef {import('../ports/idGenerator.js').IdGenerator} IdGenerator */

/**
 * An account with its derived balance (opening balance + all transactions). Never stored.
 * @typedef {{ account: Account, balanceMinor: number }} AccountBalance
 */

/** Use cases for accounts. */
export class AccountService {
  #accounts;
  #transactions;
  #clock;
  #ids;

  /**
   * @param {{ accounts: AccountRepository, transactions: TransactionRepository, clock: Clock, ids: IdGenerator }} deps
   */
  constructor({ accounts, transactions, clock, ids }) {
    this.#accounts = accounts;
    this.#transactions = transactions;
    this.#clock = clock;
    this.#ids = ids;
  }

  /**
   * @param {{ includeArchived?: boolean }} [options]
   * @returns {Promise<Account[]>}
   */
  list(options) {
    return this.#accounts.list(options);
  }

  /**
   * @param {string} id
   * @returns {Promise<Account>}
   * @throws {NotFoundError}
   */
  async get(id) {
    const account = await this.#accounts.get(id);
    if (!account) throw new NotFoundError('account', id);
    return account;
  }

  /**
   * Accounts with balances computed from indexed queries.
   * @param {{ includeArchived?: boolean }} [options]
   * @returns {Promise<AccountBalance[]>}
   */
  async listWithBalances(options) {
    const accounts = await this.#accounts.list(options);
    return Promise.all(
      accounts.map(async (account) => ({
        account,
        balanceMinor:
          account.openingBalanceMinor + (await this.#transactions.netForAccount(account.id)),
      })),
    );
  }

  /**
   * @param {AccountInput} input
   * @returns {Promise<Account>}
   * @throws {import('../errors.js').ValidationError}
   */
  async create(input) {
    const account = createAccount(input, { id: this.#ids.newId(), now: this.#clock.nowIso() });
    await this.#accounts.create(account);
    return account;
  }

  /**
   * @param {string} id
   * @param {AccountInput} input
   * @returns {Promise<void>}
   */
  async update(id, input) {
    const existing = await this.get(id);
    const edits = accountEdits(existing, input);
    await this.#accounts.update(id, { ...edits, updatedAt: this.#clock.nowIso() });
  }

  /**
   * Archived accounts are hidden from pickers and totals but keep their history.
   * @param {string} id
   * @param {boolean} archived
   * @returns {Promise<void>}
   */
  async setArchived(id, archived) {
    await this.get(id);
    await this.#accounts.update(id, { archived, updatedAt: this.#clock.nowIso() });
  }
}
