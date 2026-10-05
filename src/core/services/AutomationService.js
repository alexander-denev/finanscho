import {
  buildEventResults,
  buildRunNowResults,
  buildScheduledResults,
  canRunNow,
  canTrigger,
  createAutomation,
  hasEventTrigger,
  isRunning,
  landingDates,
  matches,
  nextDate,
  normalizeAutomationInput,
  previewEventResults,
  previewScheduledResults,
  referencedIds,
  resultPrefix,
  RUN_CAP,
  sameValue,
} from '../domain/automation.js';
import { addDays } from '../domain/localDate.js';
import { DEFAULT_CURRENCY } from '../domain/money.js';
import { compareTransactionsNewestFirst } from '../domain/transaction.js';
import { NotFoundError, ValidationError } from '../errors.js';
import { SETTING_KEYS } from './SettingsService.js';

/** @typedef {import('../domain/automation.js').Automation} Automation */
/** @typedef {import('../domain/automation.js').AutomationFields} AutomationFields */
/** @typedef {import('../domain/automation.js').AutomationInput} AutomationInput */
/** @typedef {import('../domain/automation.js').AutomationRefs} AutomationRefs */
/** @typedef {import('../domain/automation.js').AutomationResult} AutomationResult */
/** @typedef {import('../domain/transaction.js').Transaction} Transaction */
/** @typedef {import('../domain/budget.js').Budget} Budget */
/** @typedef {import('../ports/repositories.js').AutomationRepository} AutomationRepository */
/** @typedef {import('../ports/repositories.js').TransactionRepository} TransactionRepository */
/** @typedef {import('../ports/repositories.js').BudgetRepository} BudgetRepository */
/** @typedef {import('../ports/repositories.js').AccountRepository} AccountRepository */
/** @typedef {import('../ports/repositories.js').CategoryRepository} CategoryRepository */
/** @typedef {import('../ports/repositories.js').SettingsRepository} SettingsRepository */
/** @typedef {import('../ports/clock.js').Clock} Clock */
/** @typedef {import('../ports/idGenerator.js').IdGenerator} IdGenerator */

/** Days ahead shown as "upcoming". */
export const UPCOMING_DAYS = 30;
/** How far back the preview looks for transactions that would have set an automation off. */
export const PREVIEW_LOOKBACK_DAYS = 60;
/** Items each part of the preview shows. */
export const PREVIEW_ITEMS = 3;

/**
 * An automation as listed. `nextDate` is the next date a schedule makes something (null for
 * none); `usesArchived` warns that it uses an archived account or category (it keeps running).
 * @typedef {{ automation: Automation, running: boolean, nextDate: string | null, usesArchived: boolean }} AutomationSummary
 */

/**
 * A transaction a schedule will make (upcoming list).
 * @typedef {object} UpcomingItem
 * @property {string} automationId
 * @property {string} name
 * @property {number} triggerIndex
 * @property {number} actionIndex
 * @property {string} plannedDate
 * @property {string} date
 * @property {Omit<Transaction, 'createdAt' | 'updatedAt'>} transaction
 */

/**
 * What an automation would do (form preview). Nothing in it is written.
 * @typedef {object} AutomationPreview
 * @property {Array<{ date: string, results: AutomationResult[] }>} dates the next schedule dates
 * @property {Array<{ source: Transaction, results: AutomationResult[] }>} matches recent transactions that pass the If checks
 */

/** Use cases for automations: "When … If … Do …" (docs/DECISIONS.md, D50–D53). */
export class AutomationService {
  #automations;
  #transactions;
  #budgets;
  #accounts;
  #categories;
  #settings;
  #clock;
  #ids;
  /** @type {Promise<number> | null} */
  #running = null;
  /** @type {{ events: boolean } | null} */
  #again = null;

  /**
   * @param {{ automations: AutomationRepository, transactions: TransactionRepository, budgets: BudgetRepository, accounts: AccountRepository, categories: CategoryRepository, settings: SettingsRepository, clock: Clock, ids: IdGenerator }} deps
   */
  constructor({ automations, transactions, budgets, accounts, categories, settings, clock, ids }) {
    this.#automations = automations;
    this.#transactions = transactions;
    this.#budgets = budgets;
    this.#accounts = accounts;
    this.#categories = categories;
    this.#settings = settings;
    this.#clock = clock;
    this.#ids = ids;
  }

  /** @returns {Promise<AutomationSummary[]>} sorted by name */
  async list() {
    const today = this.#clock.today();
    const [automations, accounts, categories] = await Promise.all([
      this.#automations.list(),
      this.#accounts.list({ includeArchived: true }),
      this.#categories.list({ includeArchived: true }),
    ]);
    const archived = new Set([
      ...accounts.filter((a) => a.archived).map((a) => a.id),
      ...categories.filter((c) => c.archived).map((c) => c.id),
    ]);
    return automations.map((automation) => {
      const { accountIds, categoryIds } = referencedIds(automation);
      return {
        automation,
        running: isRunning(automation, today),
        nextDate: nextDate(automation, today),
        usesArchived: [...accountIds, ...categoryIds].some((id) => archived.has(id)),
      };
    });
  }

  /**
   * @param {string} id
   * @returns {Promise<Automation>}
   * @throws {NotFoundError}
   */
  async get(id) {
    const automation = await this.#automations.get(id);
    if (!automation) throw new NotFoundError('automation', id);
    return automation;
  }

  /**
   * @param {string} id
   * @returns {Promise<Automation | null>} null when it doesn't exist (or was deleted)
   */
  async find(id) {
    return this.#automations.get(id);
  }

  /** @returns {Promise<AutomationRefs>} */
  async #refs() {
    const [accounts, categories, currency] = await Promise.all([
      this.#accounts.list({ includeArchived: true }),
      this.#categories.list({ includeArchived: true }),
      this.#settings.get(SETTING_KEYS.defaultCurrency),
    ]);
    return {
      accounts: new Map(accounts.map((a) => [a.id, { currency: a.currency }])),
      categories: new Map(categories.map((c) => [c.id, { kind: c.kind }])),
      defaultCurrency: typeof currency === 'string' ? currency : DEFAULT_CURRENCY,
    };
  }

  /**
   * Creates an automation and makes whatever is already due.
   * @param {AutomationInput} input
   * @returns {Promise<Automation>}
   */
  async create(input) {
    const fields = normalizeAutomationInput(input, await this.#refs());
    const automation = createAutomation(fields, {
      id: this.#ids.newId(),
      now: this.#clock.nowIso(),
    });
    await this.#automations.create(automation);
    await this.run();
    return automation;
  }

  /**
   * Edits an automation in place (D52), writing only the fields that changed. Changes to When, If
   * or Do apply from today on: the start moves to today (unless the user moved it, or it is
   * later), so nothing in the past is filled in. Extending the end of a stopped automation works
   * like resuming it. What it already made is never touched.
   * @param {string} id
   * @param {AutomationInput} input
   * @returns {Promise<Automation>}
   */
  async edit(id, input) {
    const current = await this.get(id);
    const fields = normalizeAutomationInput(input, await this.#refs());
    // A Set budget step keeps the currency it was saved with, whatever the default is now.
    fields.actions = fields.actions.map((action, i) => {
      const before = current.actions[i];
      return action.type === 'setBudget' && before?.type === 'setBudget'
        ? { ...action, currency: before.currency }
        : action;
    });
    const today = this.#clock.today();
    /** @type {Partial<Automation>} */
    const changes = {};
    if (fields.name !== current.name) changes.name = fields.name;
    for (const key of /** @type {const} */ (['triggers', 'conditions', 'actions'])) {
      if (!sameValue(fields[key], current[key])) Object.assign(changes, { [key]: fields[key] });
    }
    const ruleChanged = Object.keys(changes).some((key) => key !== 'name');
    const resumed =
      current.endDate !== null &&
      current.endDate < today &&
      (fields.endDate === null || fields.endDate > current.endDate);
    let startDate = fields.startDate;
    if (startDate === current.startDate && (ruleChanged || resumed) && startDate < today) {
      startDate = today;
    }
    if (startDate !== current.startDate) changes.startDate = startDate;
    if (fields.endDate !== current.endDate) changes.endDate = fields.endDate;
    if (Object.keys(changes).length === 0) return current;
    await this.#automations.update(id, { ...changes, updatedAt: this.#clock.nowIso() });
    await this.run();
    return this.get(id);
  }

  /**
   * Stops an automation: its last day is yesterday, so nothing more happens from today on
   * (including for transactions recorded today). What it made is kept.
   * @param {string} id
   * @returns {Promise<void>}
   */
  async stop(id) {
    const automation = await this.get(id);
    const yesterday = addDays(this.#clock.today(), -1);
    if (automation.endDate !== null && automation.endDate <= yesterday) return;
    await this.#automations.update(id, { endDate: yesterday, updatedAt: this.#clock.nowIso() });
  }

  /**
   * Resumes a stopped automation from today. The days it was stopped stay skipped: its start
   * moves to today, so nothing in the pause is ever filled in.
   * @param {string} id
   * @returns {Promise<void>}
   */
  async resume(id) {
    const automation = await this.get(id);
    const today = this.#clock.today();
    await this.#automations.update(id, {
      startDate: automation.startDate > today ? automation.startDate : today,
      endDate: null,
      updatedAt: this.#clock.nowIso(),
    });
    await this.run();
  }

  /**
   * Deletes an automation. What it made is kept.
   * @param {string} id
   * @returns {Promise<void>}
   */
  async remove(id) {
    await this.get(id);
    await this.#automations.remove(id, this.#clock.nowIso());
  }

  /**
   * Does every step once, today, as if the user had entered it (fresh IDs and clocks). A Set
   * budget step replaces this month's budget.
   * @param {string} id
   * @returns {Promise<{ transactions: number, budgets: number }>}
   * @throws {ValidationError} when a step uses a percentage (there is no transaction to take it of)
   */
  async runNow(id) {
    const automation = await this.get(id);
    if (!canRunNow(automation)) throw new ValidationError({ runNow: 'validation.runNowPercent' });
    const currencyOf = await this.#currencyLookup();
    const now = this.#clock.nowIso();
    const results = buildRunNowResults(
      automation,
      this.#clock.today(),
      () => this.#ids.newId(),
      currencyOf,
    );
    const counts = { transactions: 0, budgets: 0 };
    for (const result of results) {
      if (result.entity === 'transactions') {
        await this.#transactions.create({ ...result.record, createdAt: now, updatedAt: now });
        counts.transactions += 1;
      } else {
        const existing = await this.#budgets.get(result.record.id);
        await this.#budgets.put({
          ...result.record,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        });
        counts.budgets += 1;
      }
    }
    return counts;
  }

  /**
   * What the automation made that still exists: transactions newest first, and the budgets it set
   * that the user hasn't set again since.
   * @param {string} id
   * @returns {Promise<{ transactions: Transaction[], budgets: Budget[] }>}
   */
  async history(id) {
    const [transactions, budgets] = await Promise.all([
      this.#transactions.listWithPrefix(resultPrefix(id)),
      this.#budgets.listByAutomation(id),
    ]);
    return {
      transactions: transactions.sort(compareTransactionsNewestFirst),
      budgets: budgets.sort((a, b) => (a.month < b.month ? 1 : a.month > b.month ? -1 : 0)),
    };
  }

  /**
   * What an automation being edited would do: its next schedule dates, and recent transactions
   * that pass its If checks, each with what it would make. Writes nothing.
   * @param {AutomationInput} input
   * @returns {Promise<AutomationPreview>}
   * @throws {ValidationError} when the input isn't complete yet
   */
  async preview(input) {
    const today = this.#clock.today();
    const fields = normalizeAutomationInput(
      { ...input, name: input.name?.trim() ? input.name : '-' },
      await this.#refs(),
    );
    const automation = createAutomation(fields, { id: 'preview', now: this.#clock.nowIso() });
    const currencyOf = await this.#currencyLookup();
    const firstDay = automation.startDate > today ? automation.startDate : today;
    const dates = landingDates(automation, firstDay, addDays(firstDay, 3 * 366))
      .slice(0, PREVIEW_ITEMS)
      .map((landing) => ({
        date: landing.date,
        results: previewScheduledResults(automation, landing, currencyOf),
      }));
    /** @type {AutomationPreview['matches']} */
    const found = [];
    if (hasEventTrigger(automation)) {
      const recent = await this.#transactions.listInRange(
        addDays(today, -PREVIEW_LOOKBACK_DAYS),
        today,
      );
      for (const source of recent.sort(compareTransactionsNewestFirst)) {
        if (!canTrigger(source) || !matches(automation.conditions, source, currencyOf)) continue;
        found.push({ source, results: previewEventResults(automation, source, currencyOf) });
        if (found.length >= PREVIEW_ITEMS) break;
      }
    }
    return { dates, matches: found };
  }

  /**
   * Transactions schedules will make in the next `days` days (tomorrow onwards), soonest first.
   * @param {number} [days]
   * @returns {Promise<UpcomingItem[]>}
   */
  async upcoming(days = UPCOMING_DAYS) {
    const today = this.#clock.today();
    const [automations, currencyOf] = await Promise.all([
      this.#automations.list(),
      this.#currencyLookup(),
    ]);
    /** @type {UpcomingItem[]} */
    const items = [];
    for (const automation of automations) {
      for (const landing of landingDates(automation, addDays(today, 1), addDays(today, days))) {
        for (const result of previewScheduledResults(automation, landing, currencyOf)) {
          if (result.entity !== 'transactions') continue;
          items.push({
            automationId: automation.id,
            name: automation.name,
            triggerIndex: landing.triggerIndex,
            actionIndex: result.actionIndex,
            plannedDate: landing.planned,
            date: landing.date,
            transaction: result.record,
          });
        }
      }
    }
    return items.sort((a, b) =>
      a.date !== b.date
        ? a.date < b.date
          ? -1
          : 1
        : a.name.localeCompare(b.name) || a.actionIndex - b.actionIndex,
    );
  }

  /**
   * Makes everything that is due for every automation that isn't deleted. Only one run happens at
   * a time: a call during a run schedules one more run after it and shares its promise.
   * @param {{ events?: boolean }} [options] `events: false` skips "a transaction is recorded"
   *   (nothing it reacts to changed); schedules always run
   * @returns {Promise<number>} results written
   */
  run(options = {}) {
    const events = options.events ?? true;
    if (this.#running) {
      this.#again = { events: events || (this.#again?.events ?? false) };
      return this.#running;
    }
    this.#running = (async () => {
      let written = 0;
      /** @type {{ events: boolean } | null} */
      let next = { events };
      while (next) {
        this.#again = null;
        written += await this.#runOnce(next.events);
        next = this.#again;
      }
      return written;
    })().finally(() => {
      this.#running = null;
    });
    return this.#running;
  }

  /**
   * @param {boolean} events
   * @returns {Promise<number>}
   */
  async #runOnce(events) {
    const today = this.#clock.today();
    const automations = await this.#automations.list();
    if (automations.length === 0) return 0;
    const [currencyOf, existingBudgetIds] = await Promise.all([
      this.#currencyLookup(),
      this.#budgets.allIds(),
    ]);
    const reacting = automations.filter(hasEventTrigger);
    /** @type {Transaction[]} */
    let sources = [];
    if (events && reacting.length > 0) {
      const from = reacting.map((a) => a.startDate).reduce((a, b) => (a < b ? a : b));
      if (from <= today) sources = await this.#transactions.listInRange(from, today);
    }
    let written = 0;
    for (const automation of automations) {
      const ctx = {
        today,
        existingIds: await this.#transactions.idsWithPrefix(resultPrefix(automation.id)),
        existingBudgetIds,
        currencyOf,
      };
      const results = buildScheduledResults(automation, ctx);
      if (sources.length > 0 && results.length < RUN_CAP) {
        results.push(
          ...buildEventResults(automation, sources, { ...ctx, cap: RUN_CAP - results.length }),
        );
      }
      if (results.length === 0) continue;
      written += await this.#automations.writeResults(automation.id, results);
      for (const result of results) {
        if (result.entity === 'budgets') existingBudgetIds.add(result.record.id);
      }
    }
    return written;
  }

  /** @returns {Promise<(accountId: string) => string | null>} */
  async #currencyLookup() {
    const accounts = await this.#accounts.list({ includeArchived: true });
    const currencies = new Map(accounts.map((a) => [a.id, a.currency]));
    return (accountId) => currencies.get(accountId) ?? null;
  }
}
