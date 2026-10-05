import { RULE_FIELDS } from '../../../core/domain/automation.js';
import { HybridLogicalClock } from '../../sync/HybridLogicalClock.js';
import { isVisible } from '../../sync/merge.js';
import { STORES } from '../database.js';
import { byName, fieldsOf, visibleEntities, visibleEntity } from './recordMapping.js';

/** @typedef {import('../../../core/domain/automation.js').Automation} Automation */
/** @typedef {import('../../../core/domain/automation.js').AutomationResult} AutomationResult */
/** @typedef {import('../../sync/merge.js').StoredRecord} StoredRecord */
/** @typedef {import('../database.js').Db} Db */
/** @typedef {import('../ChangeRecorder.js').ChangeRecorder} ChangeRecorder */

/**
 * The newest of the automation's rule-field clocks (docs/DECISIONS.md, D51): the same on every
 * device that has the same version of the automation, and newer after every rule edit.
 * @param {StoredRecord} automation
 * @returns {string | null}
 */
function ruleClock(automation) {
  /** @type {string | null} */
  let newest = null;
  for (const field of RULE_FIELDS) {
    const clock = automation._clocks[field];
    if (clock !== undefined && (newest === null || clock > newest)) newest = clock;
  }
  return newest;
}

/**
 * The audit timestamp matching a clock, so results written with the same clock on two devices
 * are identical.
 * @param {string} clock
 * @returns {string}
 */
function isoOf(clock) {
  return new Date(HybridLogicalClock.parse(clock)?.wallMs ?? 0).toISOString();
}

/** IndexedDB implementation of the AutomationRepository port. */
export class IdbAutomationRepository {
  #db;
  #recorder;

  /** @param {{ db: Db, recorder: ChangeRecorder }} deps */
  constructor({ db, recorder }) {
    this.#db = db;
    this.#recorder = recorder;
  }

  /** @returns {Promise<Automation[]>} sorted by name */
  async list() {
    /** @type {Automation[]} */
    const automations = visibleEntities(await this.#db.getAll(STORES.automations));
    return automations.sort((a, b) => byName(a, b) || a.id.localeCompare(b.id));
  }

  /**
   * @param {string} id
   * @returns {Promise<Automation | null>}
   */
  async get(id) {
    return visibleEntity(await this.#db.get(STORES.automations, id));
  }

  /**
   * @param {Automation} automation
   * @returns {Promise<void>}
   */
  async create(automation) {
    await this.#recorder.write({
      entity: 'automations',
      id: automation.id,
      fields: fieldsOf(automation),
    });
  }

  /**
   * @param {string} id
   * @param {Partial<Automation>} changes
   * @returns {Promise<void>}
   */
  async update(id, changes) {
    await this.#recorder.write({ entity: 'automations', id, fields: fieldsOf(changes) });
  }

  /**
   * @param {string} id
   * @param {string} updatedAt
   * @returns {Promise<void>}
   */
  async remove(id, updatedAt) {
    await this.#recorder.write({
      entity: 'automations',
      id,
      fields: { deleted: true, updatedAt },
    });
  }

  /**
   * Writes an automation's results in one transaction. A result is skipped when its ID exists in
   * any state (so deleting a result is permanent, and a budget month that has any record is left
   * alone), when the automation is gone, or when its recorded transaction is gone. Every result is
   * written with the automation's rule clock: every device with the same version derives the same
   * one, and it grows with each rule edit, so when two devices make the same result from an old
   * and an edited version, the edited one wins, while any edit by the user (a fresh clock) beats
   * both. `createdAt`/`updatedAt` are the clock's time, or the recorded transaction's creation time
   * when that is later, so a result sorts next to the transaction that set it off.
   * @param {string} automationId
   * @param {AutomationResult[]} results
   * @returns {Promise<number>} results written
   */
  async writeResults(automationId, results) {
    let written = 0;
    await this.#recorder.transact(['automations', 'transactions', 'budgets'], async (ctx) => {
      const automation = await ctx.get('automations', automationId);
      if (!automation || !isVisible(automation)) return;
      const clock = ruleClock(automation);
      if (clock === null) return;
      for (const result of results) {
        if (await ctx.get(result.entity, result.record.id)) continue;
        let at = isoOf(clock);
        if (result.sourceId !== null) {
          const source = await ctx.get('transactions', result.sourceId);
          if (!source || !isVisible(source)) continue;
          if (String(source.createdAt) > at) at = String(source.createdAt);
        }
        await ctx.write({
          entity: result.entity,
          id: result.record.id,
          fields: { ...fieldsOf(result.record), createdAt: at, updatedAt: at },
          origin: 'automation',
          hlc: clock,
        });
        written += 1;
      }
    });
    return written;
  }
}
