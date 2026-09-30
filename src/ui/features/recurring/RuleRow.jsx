import { Amount } from '../../components/Amount.jsx';
import { Swatch } from '../../components/Swatch.jsx';
import { formatDate, t } from '../../i18n/i18n.js';
import styles from './RuleRow.module.css';

/**
 * Human-readable schedule, e.g. "Monthly" or "Every 2 weeks".
 * @param {{ frequency: string, interval: number }} rule
 * @returns {string}
 */
export function describeSchedule({ frequency, interval }) {
  return interval === 1
    ? t(`frequency.${frequency}`)
    : t(`frequency.every.${frequency}`, { n: interval });
}

/**
 * @typedef {object} RuleRowProps
 * @property {import('../../../core/services/RecurringService.js').RuleSummary} summary
 * @property {string} title
 * @property {string | null} color
 * @property {string} currency
 * @property {(ruleId: string) => void} onSelect
 */

/**
 * One recurring rule: what, how often, when next, and how much.
 * @param {RuleRowProps} props
 * @returns {import('preact').JSX.Element}
 */
export function RuleRow({ summary, title, color, currency, onSelect }) {
  const { rule, nextDate } = summary;
  return (
    <button type="button" className={styles.row} onClick={() => onSelect(rule.id)}>
      <Swatch color={color} />
      <span className={styles.text}>
        <span className={styles.title}>{title}</span>
        <span className={styles.details}>
          {describeSchedule(rule)} ·{' '}
          {nextDate
            ? t('recurring.next', { date: formatDate(nextDate, 'medium') })
            : t('recurring.ended')}
        </span>
      </span>
      <Amount minor={rule.template.amountMinor} currency={currency} kind={rule.template.kind} />
    </button>
  );
}
