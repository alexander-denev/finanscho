import { STORES } from '../database.js';
import { fieldsOf, visibleEntities, visibleEntity } from './recordMapping.js';

/** @typedef {import('../../../core/domain/recurringRule.js').RecurringRule} RecurringRule */
/** @typedef {import('../database.js').Db} Db */
/** @typedef {import('../ChangeRecorder.js').ChangeRecorder} ChangeRecorder */

/**
 * IndexedDB implementation of the RecurringRuleRepository port. Rules are immutable after
 * creation except `endDate` and `deleted`, so there is no general update method.
 */
export class IdbRecurringRuleRepository {
  #db;
  #recorder;

  /** @param {{ db: Db, recorder: ChangeRecorder }} deps */
  constructor({ db, recorder }) {
    this.#db = db;
    this.#recorder = recorder;
  }

  /** @returns {Promise<RecurringRule[]>} sorted by start date */
  async list() {
    /** @type {RecurringRule[]} */
    const rules = visibleEntities(await this.#db.getAll(STORES.recurringRules));
    return rules.sort((a, b) =>
      a.startDate === b.startDate ? a.id.localeCompare(b.id) : a.startDate < b.startDate ? -1 : 1,
    );
  }

  /**
   * @param {string} id
   * @returns {Promise<RecurringRule | null>}
   */
  async get(id) {
    return visibleEntity(await this.#db.get(STORES.recurringRules, id));
  }

  /**
   * @param {RecurringRule} rule
   * @returns {Promise<void>}
   */
  async create(rule) {
    await this.#recorder.write({ entity: 'recurringRules', id: rule.id, fields: fieldsOf(rule) });
  }

  /**
   * @param {string} id
   * @param {string | null} endDate
   * @param {string} updatedAt
   * @returns {Promise<void>}
   */
  async setEndDate(id, endDate, updatedAt) {
    await this.#recorder.write({ entity: 'recurringRules', id, fields: { endDate, updatedAt } });
  }

  /**
   * The skipped occurrences are written first, so any device that applies the new end date has
   * already applied them (ops are applied in outbox order) and never materializes them.
   * @param {string} id
   * @param {string | null} endDate
   * @param {string[]} skippedOccurrenceIds
   * @param {string} updatedAt
   * @returns {Promise<void>}
   */
  async reopen(id, endDate, skippedOccurrenceIds, updatedAt) {
    await this.#recorder.transact(['transactions', 'recurringRules'], async (ctx) => {
      for (const occurrenceId of skippedOccurrenceIds) {
        if (await ctx.get('transactions', occurrenceId)) continue;
        await ctx.write({
          entity: 'transactions',
          id: occurrenceId,
          fields: { deleted: true, updatedAt },
        });
      }
      await ctx.write({ entity: 'recurringRules', id, fields: { endDate, updatedAt } });
    });
  }

  /**
   * @param {string} id
   * @param {string} updatedAt
   * @returns {Promise<void>}
   */
  async remove(id, updatedAt) {
    await this.#recorder.write({
      entity: 'recurringRules',
      id,
      fields: { deleted: true, updatedAt },
    });
  }
}
