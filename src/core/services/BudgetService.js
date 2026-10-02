import { budgetId, budgetProgress, normalizeBudgetInput } from '../domain/budget.js';
import { addMonthsToYearMonth, isYearMonth, yearMonthOf } from '../domain/localDate.js';
import { DEFAULT_CURRENCY, sumMinor } from '../domain/money.js';
import { ValidationError } from '../errors.js';
import { SETTING_KEYS } from './SettingsService.js';

/** @typedef {import('../domain/budget.js').Budget} Budget */
/** @typedef {import('../domain/budget.js').BudgetInput} BudgetInput */
/** @typedef {import('../domain/budget.js').BudgetProgress} BudgetProgress */
/** @typedef {import('../domain/category.js').Category} Category */
/** @typedef {import('../ports/repositories.js').BudgetRepository} BudgetRepository */
/** @typedef {import('../ports/repositories.js').CategoryRepository} CategoryRepository */
/** @typedef {import('../ports/repositories.js').AccountRepository} AccountRepository */
/** @typedef {import('../ports/repositories.js').TransactionRepository} TransactionRepository */
/** @typedef {import('../ports/repositories.js').SettingsRepository} SettingsRepository */
/** @typedef {import('../ports/clock.js').Clock} Clock */

/**
 * @typedef {object} BudgetLine
 * @property {Budget} budget
 * @property {Category} category
 * @property {BudgetProgress} progress
 */

/**
 * @typedef {object} MonthBudgets
 * @property {string} month
 * @property {BudgetLine[]} lines budgets sorted by category name
 * @property {Category[]} unbudgeted active expense categories without a budget this month
 */

/** Use cases for monthly budgets. */
export class BudgetService {
  #budgets;
  #categories;
  #accounts;
  #transactions;
  #settings;
  #clock;

  /**
   * @param {{ budgets: BudgetRepository, categories: CategoryRepository, accounts: AccountRepository, transactions: TransactionRepository, settings: SettingsRepository, clock: Clock }} deps
   */
  constructor({ budgets, categories, accounts, transactions, settings, clock }) {
    this.#budgets = budgets;
    this.#categories = categories;
    this.#accounts = accounts;
    this.#transactions = transactions;
    this.#settings = settings;
    this.#clock = clock;
  }

  /**
   * Budgets for a month with spending computed from the `[categoryId+date]` index. Spending counts
   * only expenses in accounts of the budget's currency (no conversion in v1).
   * @param {string} month 'YYYY-MM'
   * @returns {Promise<MonthBudgets>}
   */
  async forMonth(month) {
    if (!isYearMonth(month)) throw new ValidationError({ month: 'validation.month' });
    const [budgets, categories, accounts] = await Promise.all([
      this.#budgets.listByMonth(month),
      this.#categories.list({ kind: 'expense', includeArchived: true }),
      this.#accounts.list({ includeArchived: true }),
    ]);
    const currencyOf = new Map(accounts.map((a) => [a.id, a.currency]));
    const categoryById = new Map(categories.map((c) => [c.id, c]));
    /** @type {BudgetLine[]} */
    const lines = [];
    for (const budget of budgets) {
      const category = categoryById.get(budget.categoryId);
      if (!category) continue;
      const spending = await this.#transactions.listForCategoryInMonth(budget.categoryId, month);
      const spent = sumMinor(
        spending
          .filter((t) => t.kind === 'expense' && currencyOf.get(t.accountId) === budget.currency)
          .map((t) => t.amountMinor),
      );
      lines.push({ budget, category, progress: budgetProgress(budget.limitMinor, spent) });
    }
    lines.sort((a, b) => a.category.name.localeCompare(b.category.name));
    const budgeted = new Set(budgets.map((b) => b.categoryId));
    const unbudgeted = categories.filter((c) => !c.archived && !budgeted.has(c.id));
    return { month, lines, unbudgeted };
  }

  /**
   * Creates or updates the budget for a category and month (deterministic id).
   * @param {BudgetInput} input
   * @returns {Promise<Budget>}
   */
  async set(input) {
    const category = await this.#categories.get(input.categoryId);
    const currency = await this.#defaultCurrency();
    const fields = normalizeBudgetInput(input, category, currency);
    const existing = await this.#budgets.get(fields.id);
    const now = this.#clock.nowIso();
    /** @type {Budget} */
    const budget = {
      ...fields,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      deleted: false,
    };
    await this.#budgets.put(budget);
    if (budget.recurring) await this.materialize();
    return budget;
  }

  /**
   * Carries recurring budgets forward: for each active expense category whose newest budget up to
   * this month repeats, copies it into every later month up to this month. A month with its own
   * budget, a removed budget, or a budget that doesn't repeat ends the chain.
   * @param {string} [today]
   * @returns {Promise<number>} budgets written
   */
  async materialize(today = this.#clock.today()) {
    const month = yearMonthOf(today);
    const [latest, categories] = await Promise.all([
      this.#budgets.latestPerCategory(month),
      this.#categories.list({ kind: 'expense' }),
    ]);
    let written = 0;
    for (const category of categories) {
      const source = latest.get(category.id)?.budget;
      if (!source?.recurring || source.month >= month) continue;
      /** @type {string[]} */
      const months = [];
      for (let m = addMonthsToYearMonth(source.month, 1); m <= month;) {
        months.push(m);
        m = addMonthsToYearMonth(m, 1);
      }
      written += await this.#budgets.copyRecurring(source.id, months);
    }
    return written;
  }

  /**
   * @param {string} budgetId
   * @returns {Promise<void>}
   */
  async remove(budgetId) {
    if (!(await this.#budgets.get(budgetId))) return;
    await this.#budgets.remove(budgetId, this.#clock.nowIso());
  }

  /**
   * Copies last month's budgets into `month` for categories that have no budget yet this month.
   * Archived categories are skipped.
   * @param {string} month 'YYYY-MM'
   * @returns {Promise<number>} how many budgets were copied
   */
  async copyFromPreviousMonth(month) {
    if (!isYearMonth(month)) throw new ValidationError({ month: 'validation.month' });
    const previous = addMonthsToYearMonth(month, -1);
    const [source, target, categories] = await Promise.all([
      this.#budgets.listByMonth(previous),
      this.#budgets.listByMonth(month),
      this.#categories.list({ kind: 'expense' }),
    ]);
    const active = new Set(categories.map((c) => c.id));
    const existing = new Set(target.map((b) => b.categoryId));
    const now = this.#clock.nowIso();
    let copied = 0;
    for (const budget of source) {
      if (existing.has(budget.categoryId) || !active.has(budget.categoryId)) continue;
      await this.#budgets.put({
        ...budget,
        id: budgetId(budget.categoryId, month),
        month,
        recurring: budget.recurring === true,
        createdAt: now,
        updatedAt: now,
        deleted: false,
      });
      copied += 1;
    }
    return copied;
  }

  /** @returns {Promise<string>} */
  async #defaultCurrency() {
    const value = await this.#settings.get(SETTING_KEYS.defaultCurrency);
    return typeof value === 'string' ? value : DEFAULT_CURRENCY;
  }
}
