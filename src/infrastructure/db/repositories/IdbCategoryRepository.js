import { SEED_HLC } from '../../sync/HybridLogicalClock.js';
import { STORES } from '../database.js';
import { byName, fieldsOf, visibleEntities, visibleEntity } from './recordMapping.js';

/** @typedef {import('../../../core/domain/category.js').Category} Category */
/** @typedef {import('../../../core/domain/category.js').CategoryKind} CategoryKind */
/** @typedef {import('../database.js').Db} Db */
/** @typedef {import('../ChangeRecorder.js').ChangeRecorder} ChangeRecorder */

/** IndexedDB implementation of the CategoryRepository port. */
export class IdbCategoryRepository {
  #db;
  #recorder;

  /** @param {{ db: Db, recorder: ChangeRecorder }} deps */
  constructor({ db, recorder }) {
    this.#db = db;
    this.#recorder = recorder;
  }

  /**
   * @param {{ kind?: CategoryKind, includeArchived?: boolean }} [options]
   * @returns {Promise<Category[]>}
   */
  async list(options = {}) {
    /** @type {Category[]} */
    const categories = visibleEntities(await this.#db.getAll(STORES.categories));
    return categories
      .filter(
        (c) =>
          (options.kind === undefined || c.kind === options.kind) &&
          (options.includeArchived || !c.archived),
      )
      .sort(byName);
  }

  /**
   * @param {string} id
   * @returns {Promise<Category | null>}
   */
  async get(id) {
    return visibleEntity(await this.#db.get(STORES.categories, id));
  }

  /**
   * @param {Category} category
   * @returns {Promise<void>}
   */
  async create(category) {
    await this.#recorder.write({
      entity: 'categories',
      id: category.id,
      fields: fieldsOf(category),
    });
  }

  /**
   * @param {string} id
   * @param {Partial<Category>} changes
   * @returns {Promise<void>}
   */
  async update(id, changes) {
    await this.#recorder.write({ entity: 'categories', id, fields: fieldsOf(changes) });
  }

  /**
   * Writes seeded categories that do not exist yet (in any state), using the minimum clock so
   * that any user edit or deletion on any device wins.
   * @param {Category[]} categories
   * @returns {Promise<number>}
   */
  async seed(categories) {
    let written = 0;
    await this.#recorder.transact(['categories'], async (ctx) => {
      for (const category of categories) {
        if (await ctx.get('categories', category.id)) continue;
        await ctx.write({
          entity: 'categories',
          id: category.id,
          fields: fieldsOf(category),
          hlc: SEED_HLC,
        });
        written += 1;
      }
    });
    return written;
  }
}
