import { buildDefaultCategories, categoryEdits, createCategory } from '../domain/category.js';
import { InUseError, NotFoundError } from '../errors.js';
import { SETTING_KEYS } from './SettingsService.js';

/** @typedef {import('../domain/category.js').Category} Category */
/** @typedef {import('../domain/category.js').CategoryInput} CategoryInput */
/** @typedef {import('../domain/category.js').CategoryKind} CategoryKind */
/** @typedef {import('../ports/repositories.js').CategoryRepository} CategoryRepository */
/** @typedef {import('../ports/repositories.js').TransactionRepository} TransactionRepository */
/** @typedef {import('../ports/repositories.js').RecurringRuleRepository} RecurringRuleRepository */
/** @typedef {import('../ports/repositories.js').SettingsRepository} SettingsRepository */
/** @typedef {import('../ports/clock.js').Clock} Clock */
/** @typedef {import('../ports/idGenerator.js').IdGenerator} IdGenerator */

/** Use cases for categories. */
export class CategoryService {
  #categories;
  #transactions;
  #rules;
  #settings;
  #clock;
  #ids;

  /**
   * @param {{ categories: CategoryRepository, transactions: TransactionRepository, rules: RecurringRuleRepository, settings: SettingsRepository, clock: Clock, ids: IdGenerator }} deps
   */
  constructor({ categories, transactions, rules, settings, clock, ids }) {
    this.#categories = categories;
    this.#transactions = transactions;
    this.#rules = rules;
    this.#settings = settings;
    this.#clock = clock;
    this.#ids = ids;
  }

  /**
   * @param {{ kind?: CategoryKind, includeArchived?: boolean }} [options]
   * @returns {Promise<Category[]>}
   */
  list(options) {
    return this.#categories.list(options);
  }

  /**
   * @param {string} id
   * @returns {Promise<Category>}
   * @throws {NotFoundError}
   */
  async get(id) {
    const category = await this.#categories.get(id);
    if (!category) throw new NotFoundError('category', id);
    return category;
  }

  /**
   * Seeds the default categories once per install. IDs are deterministic (`seed:<slug>`) and seeds
   * never overwrite existing records, so seeding on several devices converges.
   * @returns {Promise<number>} how many categories were written
   */
  async seedDefaults() {
    if ((await this.#settings.get(SETTING_KEYS.categoriesSeeded)) === true) return 0;
    const written = await this.#categories.seed(buildDefaultCategories());
    await this.#settings.set(SETTING_KEYS.categoriesSeeded, true);
    return written;
  }

  /**
   * @param {CategoryInput} input
   * @returns {Promise<Category>}
   */
  async create(input) {
    const category = createCategory(input, { id: this.#ids.newId(), now: this.#clock.nowIso() });
    await this.#categories.create(category);
    return category;
  }

  /**
   * @param {string} id
   * @param {CategoryInput} input
   * @returns {Promise<void>}
   */
  async update(id, input) {
    const existing = await this.get(id);
    const edits = categoryEdits(existing, input);
    await this.#categories.update(id, { ...edits, updatedAt: this.#clock.nowIso() });
  }

  /**
   * @param {string} id
   * @param {boolean} archived
   * @returns {Promise<void>}
   */
  async setArchived(id, archived) {
    await this.get(id);
    await this.#categories.update(id, { archived, updatedAt: this.#clock.nowIso() });
  }

  /**
   * Whether any transaction or recurring rule (including ended ones) uses the category.
   * @param {string} id
   * @returns {Promise<boolean>}
   */
  async isInUse(id) {
    if (await this.#transactions.hasAnyForCategory(id)) return true;
    const rules = await this.#rules.list();
    return rules.some((r) => r.template.categoryId === id);
  }

  /**
   * Deletes a category that nothing uses. Categories with history must be archived instead, so
   * deleting never leaves a transaction pointing at a missing category. Budgets don't count as
   * use: once the category is gone they are hidden and no longer copied forward.
   * @param {string} id
   * @returns {Promise<void>}
   * @throws {NotFoundError | InUseError}
   */
  async remove(id) {
    await this.get(id);
    if (await this.isInUse(id)) throw new InUseError('category', id);
    await this.#categories.remove(id, this.#clock.nowIso());
  }

  /**
   * Restores deleted categories that a transaction or rule uses again. That happens when another
   * device used an empty category while this one deleted it; the data wins over the delete.
   * Runs after every pull.
   * @returns {Promise<number>} how many categories were restored
   */
  async restoreUsed() {
    let restored = 0;
    for (const category of await this.#categories.listDeleted()) {
      if (!(await this.isInUse(category.id))) continue;
      await this.#categories.update(category.id, {
        deleted: false,
        updatedAt: this.#clock.nowIso(),
      });
      restored += 1;
    }
    return restored;
  }
}
