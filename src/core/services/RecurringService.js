import { addDays } from '../domain/localDate.js';
import { occurrencesBetween, occurrencesUntil } from '../domain/recurrenceSchedule.js';
import {
  buildOccurrence,
  createRecurringRule,
  endDateForEdit,
  MATERIALIZE_CAP,
  normalizeRuleInput,
  occurrenceId,
} from '../domain/recurringRule.js';
import { NotFoundError } from '../errors.js';

/** @typedef {import('../domain/recurringRule.js').RecurringRule} RecurringRule */
/** @typedef {import('../domain/recurringRule.js').RecurringRuleInput} RecurringRuleInput */
/** @typedef {import('../domain/recurringRule.js').RuleTemplate} RuleTemplate */
/** @typedef {import('../ports/repositories.js').RecurringRuleRepository} RecurringRuleRepository */
/** @typedef {import('../ports/repositories.js').TransactionRepository} TransactionRepository */
/** @typedef {import('../ports/repositories.js').AccountRepository} AccountRepository */
/** @typedef {import('../ports/repositories.js').CategoryRepository} CategoryRepository */
/** @typedef {import('../ports/clock.js').Clock} Clock */
/** @typedef {import('../ports/idGenerator.js').IdGenerator} IdGenerator */

/** Days ahead shown as "upcoming". */
export const UPCOMING_DAYS = 30;

/**
 * @typedef {object} UpcomingOccurrence
 * @property {string} ruleId
 * @property {string} date
 * @property {RuleTemplate} template
 */

/** @typedef {{ rule: RecurringRule, nextDate: string | null }} RuleSummary */

/** Use cases for recurring rules and their occurrences. */
export class RecurringService {
  #rules;
  #transactions;
  #accounts;
  #categories;
  #clock;
  #ids;

  /**
   * @param {{ rules: RecurringRuleRepository, transactions: TransactionRepository, accounts: AccountRepository, categories: CategoryRepository, clock: Clock, ids: IdGenerator }} deps
   */
  constructor({ rules, transactions, accounts, categories, clock, ids }) {
    this.#rules = rules;
    this.#transactions = transactions;
    this.#accounts = accounts;
    this.#categories = categories;
    this.#clock = clock;
    this.#ids = ids;
  }

  /**
   * Rules with their next occurrence after today (null when the rule has ended).
   * @returns {Promise<RuleSummary[]>}
   */
  async list() {
    const tomorrow = addDays(this.#clock.today(), 1);
    const rules = await this.#rules.list();
    return rules.map((rule) => ({
      rule,
      nextDate: occurrencesBetween(rule, tomorrow, '9999-12-31', 1)[0] ?? null,
    }));
  }

  /**
   * @param {string} id
   * @returns {Promise<RecurringRule>}
   * @throws {NotFoundError}
   */
  async get(id) {
    const rule = await this.#rules.get(id);
    if (!rule) throw new NotFoundError('recurringRule', id);
    return rule;
  }

  /**
   * @param {RecurringRuleInput} input
   * @returns {Promise<RecurringRule>}
   */
  async #build(input) {
    const [account, toAccount, category] = await Promise.all([
      input.template.accountId ? this.#accounts.get(input.template.accountId) : null,
      input.template.toAccountId ? this.#accounts.get(input.template.toAccountId) : null,
      input.template.categoryId ? this.#categories.get(input.template.categoryId) : null,
    ]);
    const fields = normalizeRuleInput(input, { account, toAccount, category });
    return createRecurringRule(fields, { id: this.#ids.newId(), now: this.#clock.nowIso() });
  }

  /**
   * Creates a rule and immediately materializes any occurrences due up to today.
   * @param {RecurringRuleInput} input
   * @returns {Promise<RecurringRule>}
   */
  async create(input) {
    const rule = await this.#build(input);
    await this.#rules.create(rule);
    await this.#materializeRule(rule, this.#clock.today());
    return rule;
  }

  /**
   * "Edits" an immutable rule: ends the old rule the day before the new start date and creates a
   * new rule from the input. The new rule is validated before the old one is touched.
   * @param {string} ruleId
   * @param {RecurringRuleInput} input the new rule; its start date is the effective date
   * @returns {Promise<RecurringRule>} the new rule
   */
  async edit(ruleId, input) {
    const old = await this.get(ruleId);
    const replacement = await this.#build(input);
    await this.#rules.setEndDate(
      ruleId,
      endDateForEdit(old, replacement.startDate),
      this.#clock.nowIso(),
    );
    await this.#rules.create(replacement);
    await this.#materializeRule(replacement, this.#clock.today());
    return replacement;
  }

  /**
   * Stops a rule after today. Occurrences already created are kept.
   * @param {string} ruleId
   * @returns {Promise<void>}
   */
  async stop(ruleId) {
    const rule = await this.get(ruleId);
    await this.#rules.setEndDate(
      ruleId,
      endDateForEdit(rule, addDays(this.#clock.today(), 1)),
      this.#clock.nowIso(),
    );
  }

  /**
   * Deletes a rule. Occurrences already materialized are kept.
   * @param {string} ruleId
   * @returns {Promise<void>}
   */
  async remove(ruleId) {
    await this.get(ruleId);
    await this.#rules.remove(ruleId, this.#clock.nowIso());
  }

  /**
   * Creates due occurrences for every rule, from each rule's start up to and including `today`,
   * at most MATERIALIZE_CAP new occurrences per rule per run.
   * @param {string} [today]
   * @returns {Promise<number>} occurrences written
   */
  async materialize(today = this.#clock.today()) {
    let written = 0;
    for (const rule of await this.#rules.list()) {
      written += await this.#materializeRule(rule, today);
    }
    return written;
  }

  /**
   * @param {RecurringRule} rule
   * @param {string} today
   * @returns {Promise<number>}
   */
  async #materializeRule(rule, today) {
    const existing = await this.#transactions.occurrenceIdsForRule(rule.id);
    /** @type {import('../domain/transaction.js').Transaction[]} */
    const due = [];
    for (const date of occurrencesUntil(rule, today)) {
      if (existing.has(occurrenceId(rule.id, date))) continue;
      due.push(buildOccurrence(rule, date));
      if (due.length >= MATERIALIZE_CAP) break;
    }
    if (due.length === 0) return 0;
    return this.#transactions.materialize(rule.id, due);
  }

  /**
   * Occurrences in the next `days` days (tomorrow onwards), soonest first.
   * @param {number} [days]
   * @returns {Promise<UpcomingOccurrence[]>}
   */
  async upcoming(days = UPCOMING_DAYS) {
    const today = this.#clock.today();
    const from = addDays(today, 1);
    const to = addDays(today, days);
    /** @type {UpcomingOccurrence[]} */
    const items = [];
    for (const rule of await this.#rules.list()) {
      for (const date of occurrencesBetween(rule, from, to)) {
        items.push({ ruleId: rule.id, date, template: rule.template });
      }
    }
    return items.sort((a, b) =>
      a.date === b.date ? a.ruleId.localeCompare(b.ruleId) : a.date < b.date ? -1 : 1,
    );
  }
}
