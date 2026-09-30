import { STORES } from '../database.js';
import { fieldsOf, visibleEntities, visibleEntity } from './recordMapping.js';

/** @typedef {import('../../../core/domain/budget.js').Budget} Budget */
/** @typedef {import('../database.js').Db} Db */
/** @typedef {import('../ChangeRecorder.js').ChangeRecorder} ChangeRecorder */

/** IndexedDB implementation of the BudgetRepository port. */
export class IdbBudgetRepository {
  #db;
  #recorder;

  /** @param {{ db: Db, recorder: ChangeRecorder }} deps */
  constructor({ db, recorder }) {
    this.#db = db;
    this.#recorder = recorder;
  }

  /**
   * @param {string} month 'YYYY-MM'
   * @returns {Promise<Budget[]>}
   */
  async listByMonth(month) {
    return visibleEntities(await this.#db.getAllFromIndex(STORES.budgets, 'month', month));
  }

  /**
   * @param {string} id
   * @returns {Promise<Budget | null>}
   */
  async get(id) {
    return visibleEntity(await this.#db.get(STORES.budgets, id));
  }

  /**
   * Creates or replaces a budget. All fields are written (including `deleted: false`), so a budget
   * that was deleted and set again comes back.
   * @param {Budget} budget
   * @returns {Promise<void>}
   */
  async put(budget) {
    await this.#recorder.write({ entity: 'budgets', id: budget.id, fields: fieldsOf(budget) });
  }

  /**
   * @param {string} id
   * @param {string} updatedAt
   * @returns {Promise<void>}
   */
  async remove(id, updatedAt) {
    await this.#recorder.write({ entity: 'budgets', id, fields: { deleted: true, updatedAt } });
  }
}
