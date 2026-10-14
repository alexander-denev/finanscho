import { compareToPays, createToPay, normalizeToPayInput, toPayEdits } from '../domain/toPay.js';
import { NotFoundError } from '../errors.js';

/** @typedef {import('../domain/toPay.js').ToPay} ToPay */
/** @typedef {import('../domain/toPay.js').ToPayInput} ToPayInput */
/** @typedef {import('../domain/transaction.js').Transaction} Transaction */
/** @typedef {import('../domain/transaction.js').TransactionRefs} TransactionRefs */
/** @typedef {import('../ports/repositories.js').AccountRepository} AccountRepository */
/** @typedef {import('../ports/repositories.js').CategoryRepository} CategoryRepository */
/** @typedef {import('../ports/repositories.js').ToPayRepository} ToPayRepository */
/** @typedef {import('../ports/clock.js').Clock} Clock */
/** @typedef {import('../ports/idGenerator.js').IdGenerator} IdGenerator */

/** Use cases for To pays: create, edit, delete, and pay (docs/DECISIONS.md, D58). */
export class ToPayService {
  #toPays;
  #accounts;
  #categories;
  #clock;
  #ids;

  /**
   * @param {{ toPays: ToPayRepository, accounts: AccountRepository, categories: CategoryRepository, clock: Clock, ids: IdGenerator }} deps
   */
  constructor({ toPays, accounts, categories, clock, ids }) {
    this.#toPays = toPays;
    this.#accounts = accounts;
    this.#categories = categories;
    this.#clock = clock;
    this.#ids = ids;
  }

  /** @returns {Promise<ToPay[]>} soonest due first, then those without a due date */
  async list() {
    return (await this.#toPays.list()).sort(compareToPays);
  }

  /**
   * @param {string} id
   * @returns {Promise<ToPay>}
   * @throws {NotFoundError}
   */
  async get(id) {
    const toPay = await this.#toPays.get(id);
    if (!toPay) throw new NotFoundError('toPay', id);
    return toPay;
  }

  /**
   * @param {ToPayInput} input
   * @returns {Promise<TransactionRefs>}
   */
  async #refs(input) {
    const [account, toAccount, category] = await Promise.all([
      input.accountId ? this.#accounts.get(input.accountId) : null,
      input.toAccountId ? this.#accounts.get(input.toAccountId) : null,
      input.categoryId ? this.#categories.get(input.categoryId) : null,
    ]);
    return { account, toAccount, category };
  }

  /**
   * @param {ToPayInput} input
   * @returns {Promise<ToPay>}
   * @throws {import('../errors.js').ValidationError}
   */
  async create(input) {
    const fields = normalizeToPayInput(input, await this.#refs(input));
    const toPay = createToPay(fields, { id: this.#ids.newId(), now: this.#clock.nowIso() });
    await this.#toPays.create(toPay);
    return toPay;
  }

  /**
   * Edits only the To pay, writing only the fields that changed (so edits to other fields on
   * another device are kept). Nothing else reacts: the automation that made it never touches it
   * again, and `automationId` stays.
   * @param {string} id
   * @param {ToPayInput} input
   * @returns {Promise<void>}
   * @throws {NotFoundError | import('../errors.js').ValidationError}
   */
  async edit(id, input) {
    const current = await this.get(id);
    const changes = toPayEdits(current, normalizeToPayInput(input, await this.#refs(input)));
    if (Object.keys(changes).length === 0) return;
    await this.#toPays.update(id, { ...changes, updatedAt: this.#clock.nowIso() });
  }

  /**
   * @param {string} id
   * @returns {Promise<void>}
   * @throws {NotFoundError}
   */
  async remove(id) {
    await this.get(id);
    await this.#toPays.remove(id, this.#clock.nowIso());
  }

  /**
   * Records the transaction the To pay holds, dated today, and deletes the To pay.
   * @param {string} id
   * @returns {Promise<Transaction>} the recorded transaction
   * @throws {NotFoundError} when the To pay is gone (paid or deleted elsewhere)
   */
  async pay(id) {
    const payment = await this.#toPays.pay(id, this.#clock.today(), this.#clock.nowIso());
    if (!payment) throw new NotFoundError('toPay', id);
    return payment;
  }
}
