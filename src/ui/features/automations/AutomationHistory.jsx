import { UpcomingList } from '../../components/UpcomingList.jsx';
import { formatMoney, formatMonth, t } from '../../i18n/i18n.js';
import styles from './AutomationHistory.module.css';

/** @typedef {import('../../../core/domain/transaction.js').Transaction} Transaction */
/** @typedef {import('../../../core/domain/budget.js').Budget} Budget */

/**
 * @typedef {object} AutomationHistoryProps
 * @property {{ transactions: Transaction[], budgets: Budget[] }} history newest first
 * @property {(accountId: string) => string} currencyOf
 * @property {(categoryId: string) => string | undefined} categoryName
 */

/**
 * What an automation made that still exists: its transactions, then the budgets it set that
 * haven't been set again by hand.
 * @param {AutomationHistoryProps} props
 * @returns {import('preact').JSX.Element}
 */
export function AutomationHistory({ history, currencyOf, categoryName }) {
  const items = history.transactions.map((tx) => ({
    key: tx.id,
    date: tx.date,
    title: tx.payee || (tx.categoryId ? categoryName(tx.categoryId) : '') || t(`kind.${tx.kind}`),
    subtitle: tx.note || undefined,
    minor: tx.amountMinor,
    currency: currencyOf(tx.accountId),
    kind: tx.kind,
  }));
  return (
    <div className={styles.root}>
      {(items.length > 0 || history.budgets.length === 0) && (
        <UpcomingList items={items} emptyText={t('automations.historyEmpty')} />
      )}
      {history.budgets.length > 0 && (
        <ul className={styles.budgets}>
          {history.budgets.map((budget) => (
            <li key={budget.id} className={styles.budget}>
              <span>
                {t('automations.historyBudget', {
                  category: categoryName(budget.categoryId) ?? '',
                  month: formatMonth(budget.month),
                })}
              </span>
              <span className={styles.amount}>
                {formatMoney(budget.limitMinor, budget.currency)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
