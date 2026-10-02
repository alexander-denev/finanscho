import { budgetId, parseBudgetId } from '../../../core/domain/budget.js';
import { isVisible } from '../../sync/merge.js';
import { STORES } from '../database.js';
import { fieldsOf, toEntity, visibleEntities, visibleEntity } from './recordMapping.js';

/** @typedef {import('../../../core/domain/budget.js').Budget} Budget */
/** @typedef {import('../../../core/ports/repositories.js').LatestBudget} LatestBudget */
/** @typedef {import('../../sync/merge.js').StoredRecord} StoredRecord */
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

  /**
   * Reads every budget record, tombstone stubs included (they keep only their ID, which encodes
   * category and month). Budgets are few: one per category and month.
   * @param {string} throughMonth 'YYYY-MM'
   * @returns {Promise<Map<string, LatestBudget>>}
   */
  async latestPerCategory(throughMonth) {
    /** @type {Map<string, LatestBudget>} */
    const latest = new Map();
    for (const record of /** @type {StoredRecord[]} */ (await this.#db.getAll(STORES.budgets))) {
      const { categoryId, month } = parseBudgetId(record.id);
      if (month > throughMonth) continue;
      const current = latest.get(categoryId);
      if (current && current.month >= month) continue;
      latest.set(categoryId, { month, budget: isVisible(record) ? toEntity(record) : null });
    }
    return latest;
  }

  /**
   * Copies are built only from the source and written with its newest field clock, so devices
   * copying the same source produce identical records, a copy from a newer source wins, and any
   * user edit (a fresh clock) beats every copy.
   * @param {string} sourceId
   * @param {string[]} months ascending
   * @returns {Promise<number>}
   */
  async copyRecurring(sourceId, months) {
    let written = 0;
    await this.#recorder.transact(['budgets'], async (ctx) => {
      const source = await ctx.get('budgets', sourceId);
      if (!source || !isVisible(source) || source.recurring !== true) return;
      const hlc = Object.values(source._clocks).reduce((a, b) => (a > b ? a : b));
      const { id: _id, _clocks, ...fields } = source;
      for (const month of months) {
        const id = budgetId(String(source.categoryId), month);
        if (await ctx.get('budgets', id)) break;
        await ctx.write({
          entity: 'budgets',
          id,
          fields: { ...fields, month, recurring: true, deleted: false },
          origin: 'recurrence',
          hlc,
        });
        written += 1;
      }
    });
    return written;
  }
}
