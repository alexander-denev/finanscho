import { Icon } from '../../components/Icon.jsx';
import { ItemIcon } from '../../components/ItemIcon.jsx';
import { ProgressBar } from '../../components/ProgressBar.jsx';
import { formatMoney, formatPercent, t } from '../../i18n/i18n.js';
import styles from './BudgetRow.module.css';

/**
 * @typedef {object} BudgetRowProps
 * @property {import('../../../core/services/BudgetService.js').BudgetLine} line
 * @property {(budgetId: string) => void} onSelect
 */

/**
 * One budget: category, spent of limit, a progress bar, and the remaining (or over) amount in words.
 * @param {BudgetRowProps} props
 * @returns {import('preact').JSX.Element}
 */
export function BudgetRow({ line, onSelect }) {
  const { budget, category, progress } = line;
  const currency = budget.currency;
  const over = progress.remainingMinor < 0;
  const percent = Number.isFinite(progress.ratio) ? progress.ratio * 100 : 100;
  return (
    <button type="button" className={styles.row} onClick={() => onSelect(budget.id)}>
      <span className={styles.top}>
        <span className={styles.name}>
          <ItemIcon icon={category.icon} color={category.color} size="sm" />
          {category.name}
          {budget.automationId && (
            <span className={styles.repeats}>
              <Icon name="bolt" label={t('budgets.automatic')} />
            </span>
          )}
        </span>
        <span className={styles.figures}>
          {t('budgets.spentOf', {
            spent: formatMoney(progress.spentMinor, currency),
            limit: formatMoney(progress.limitMinor, currency),
          })}
        </span>
      </span>
      <ProgressBar
        ratio={progress.ratio}
        tone={progress.status}
        label={t('budgets.progressLabel', {
          category: category.name,
          percent: formatPercent(percent),
        })}
      />
      <span className={`${styles.bottom} ${styles[progress.status]}`}>
        <span>{t(`budgets.status.${progress.status}`)}</span>
        <span className={styles.remaining}>
          {over
            ? t('budgets.over', { amount: formatMoney(-progress.remainingMinor, currency) })
            : t('budgets.left', { amount: formatMoney(progress.remainingMinor, currency) })}
        </span>
      </span>
    </button>
  );
}
