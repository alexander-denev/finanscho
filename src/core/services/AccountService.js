import { accountEdits, createAccount } from '../domain/account.js';
import { createBalanceAdjustment } from '../domain/transaction.js';
import { InUseError, NotFoundError } from '../errors.js';

/** @typedef {import('../domain/account.js').Account} Account */
/** @typedef {import('../domain/account.js').AccountInput} AccountInput */
/** @typedef {import('../ports/repositories.js').AccountRepository} AccountRepository */
/** @typedef {import('../ports/repositories.js').TransactionRepository} TransactionRepository */
/** @typedef {import('../ports/repositories.js').RecurringRuleRepository} RecurringRuleRepository */
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
  #rules;
  #clock;
  #ids;

  /**
   * @param {{ accounts: AccountRepository, transactions: TransactionRepository, rules: RecurringRuleRepository, clock: Clock, ids: IdGenerator }} deps
   */
  constructor({ accounts, transactions, rules, clock, ids }) {
    this.#accounts = accounts;
    this.#transactions = transactions;
    this.#rules = rules;
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
   * The balance at the end of today: opening balance plus every transaction dated today or
   * earlier. Future-dated transactions haven't happened yet.
   * @param {string} id
   * @returns {Promise<number>}
   * @throws {NotFoundError}
   */
  async balanceToday(id) {
    const account = await this.get(id);
    const net = await this.#transactions.netForAccount(id, this.#clock.today());
    return account.openingBalanceMinor + net;
  }

  /**
   * Reconciles the account with the balance the user counted today: records one balance
   * adjustment for the difference, so the history before it stays as it was.
   * @param {string} id
   * @param {{ balance: string }} input the counted balance as typed
   * @returns {Promise<{ differenceMinor: number }>} 0 when it already matched (nothing recorded)
   * @throws {NotFoundError | import('../errors.js').ValidationError}
   */
  async reconcile(id, input) {
    const account = await this.get(id);
    const adjustment = createBalanceAdjustment(
      {
        accountId: id,
        currency: account.currency,
        bookMinor: await this.balanceToday(id),
        actual: input.balance,
        date: this.#clock.today(),
      },
      { id: this.#ids.newId(), now: this.#clock.nowIso() },
    );
    if (adjustment === null) return { differenceMinor: 0 };
    await this.#transactions.create(adjustment);
    return {
      differenceMinor:
        adjustment.kind === 'income' ? adjustment.amountMinor : -adjustment.amountMinor,
    };
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

  /**
   * Whether any transaction or recurring rule (including ended ones) uses the account.
   * @param {string} id
   * @returns {Promise<boolean>}
   */
  async isInUse(id) {
    if (await this.#transactions.hasAnyForAccount(id)) return true;
    const rules = await this.#rules.list();
    return rules.some((r) => r.template.accountId === id || r.template.toAccountId === id);
  }

  /**
   * Deletes an account that nothing uses. Accounts with history must be archived instead, so
   * deleting never changes a balance or removes a transaction.
   * @param {string} id
   * @returns {Promise<void>}
   * @throws {NotFoundError | InUseError}
   */
  async remove(id) {
    await this.get(id);
    if (await this.isInUse(id)) throw new InUseError('account', id);
    await this.#accounts.remove(id, this.#clock.nowIso());
  }

  /**
   * Restores deleted accounts that a transaction or rule uses again. That happens when another
   * device used an empty account while this one deleted it; the data wins over the delete.
   * Runs after every pull.
   * @returns {Promise<number>} how many accounts were restored
   */
  async restoreUsed() {
    let restored = 0;
    for (const account of await this.#accounts.listDeleted()) {
      if (!(await this.isInUse(account.id))) continue;
      await this.#accounts.update(account.id, { deleted: false, updatedAt: this.#clock.nowIso() });
      restored += 1;
    }
    return restored;
  }
}
