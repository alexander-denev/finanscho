import { firstDayOfMonth, lastDayOfMonth, yearMonthOf } from '../domain/localDate.js';

/** @typedef {import('./AccountService.js').AccountService} AccountService */
/** @typedef {import('./AccountService.js').AccountBalance} AccountBalance */
/** @typedef {import('./BudgetService.js').BudgetService} BudgetService */
/** @typedef {import('./BudgetService.js').BudgetLine} BudgetLine */
/** @typedef {import('./RecurringService.js').RecurringService} RecurringService */
/** @typedef {import('./RecurringService.js').UpcomingOccurrence} UpcomingOccurrence */
/** @typedef {import('../ports/repositories.js').TransactionRepository} TransactionRepository */
/** @typedef {import('../ports/clock.js').Clock} Clock */

/** @typedef {{ currency: string, amountMinor: number }} CurrencyAmount */

/**
 * @typedef {object} DashboardSummary
 * @property {string} month 'YYYY-MM'
 * @property {AccountBalance[]} balances active accounts
 * @property {CurrencyAmount[]} totals balance totals per currency
 * @property {{ currency: string, incomeMinor: number, expenseMinor: number }[]} monthFlow this month's income and expense per currency (transfers and balance adjustments excluded)
 * @property {{ lines: BudgetLine[], over: number, near: number }} budgets this month's budget status
 * @property {UpcomingOccurrence[]} upcoming recurring occurrences in the next 30 days
 */

/**
 * @param {Map<string, number>} map
 * @param {string} key
 * @param {number} amount
 * @returns {void}
 */
function add(map, key, amount) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

/** Aggregates for the dashboard, computed from indexed queries (never stored). */
export class DashboardService {
  #accounts;
  #budgets;
  #recurring;
  #transactions;
  #clock;

  /**
   * @param {{ accounts: AccountService, budgets: BudgetService, recurring: RecurringService, transactions: TransactionRepository, clock: Clock }} deps
   */
  constructor({ accounts, budgets, recurring, transactions, clock }) {
    this.#accounts = accounts;
    this.#budgets = budgets;
    this.#recurring = recurring;
    this.#transactions = transactions;
    this.#clock = clock;
  }

  /** @returns {Promise<DashboardSummary>} */
  async summary() {
    const month = yearMonthOf(this.#clock.today());
    const [balances, allAccounts, monthTx, monthBudgets, upcoming] = await Promise.all([
      this.#accounts.listWithBalances(),
      this.#accounts.list({ includeArchived: true }),
      this.#transactions.listInRange(firstDayOfMonth(month), lastDayOfMonth(month)),
      this.#budgets.forMonth(month),
      this.#recurring.upcoming(),
    ]);

    /** @type {Map<string, number>} */
    const totals = new Map();
    for (const { account, balanceMinor } of balances) add(totals, account.currency, balanceMinor);

    const currencyOf = new Map(allAccounts.map((a) => [a.id, a.currency]));
    /** @type {Map<string, number>} */
    const income = new Map();
    /** @type {Map<string, number>} */
    const expense = new Map();
    for (const tx of monthTx) {
      const currency = currencyOf.get(tx.accountId);
      // Balance adjustments correct the balance; they are not money earned or spent this month.
      if (!currency || tx.adjustment) continue;
      if (tx.kind === 'income') add(income, currency, tx.amountMinor);
      if (tx.kind === 'expense') add(expense, currency, tx.amountMinor);
    }
    const flowCurrencies = [...new Set([...income.keys(), ...expense.keys()])].sort();

    return {
      month,
      balances,
      totals: [...totals.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([currency, amountMinor]) => ({ currency, amountMinor })),
      monthFlow: flowCurrencies.map((currency) => ({
        currency,
        incomeMinor: income.get(currency) ?? 0,
        expenseMinor: expense.get(currency) ?? 0,
      })),
      budgets: {
        lines: monthBudgets.lines,
        over: monthBudgets.lines.filter((l) => l.progress.status === 'over').length,
        near: monthBudgets.lines.filter((l) => l.progress.status === 'near').length,
      },
      upcoming,
    };
  }
}
