import { buildDefaultCategories, categoryEdits, createCategory } from '../domain/category.js';
import { NotFoundError } from '../errors.js';
import { SETTING_KEYS } from './SettingsService.js';

/** @typedef {import('../domain/category.js').Category} Category */
/** @typedef {import('../domain/category.js').CategoryInput} CategoryInput */
/** @typedef {import('../domain/category.js').CategoryKind} CategoryKind */
/** @typedef {import('../ports/repositories.js').CategoryRepository} CategoryRepository */
/** @typedef {import('../ports/repositories.js').SettingsRepository} SettingsRepository */
/** @typedef {import('../ports/clock.js').Clock} Clock */
/** @typedef {import('../ports/idGenerator.js').IdGenerator} IdGenerator */

/** Use cases for categories. */
export class CategoryService {
  #categories;
  #settings;
  #clock;
  #ids;

  /**
   * @param {{ categories: CategoryRepository, settings: SettingsRepository, clock: Clock, ids: IdGenerator }} deps
   */
  constructor({ categories, settings, clock, ids }) {
    this.#categories = categories;
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
}
