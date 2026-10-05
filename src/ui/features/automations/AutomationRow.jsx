import { Icon } from '../../components/Icon.jsx';
import { formatDate, t } from '../../i18n/i18n.js';
import styles from './AutomationRow.module.css';

/** @typedef {import('../../../core/domain/automation.js').Trigger} Trigger */

/**
 * Short words for one trigger, e.g. "Monthly", "Every 2 weeks", "Monthly, last day", or "When a
 * transaction is recorded".
 * @param {Trigger} trigger
 * @returns {string}
 */
export function describeTrigger(trigger) {
  if (trigger.type === 'transactionRecorded') return t('automations.summary.transactionRecorded');
  const schedule =
    trigger.interval === 1
      ? t(`frequency.${trigger.frequency}`)
      : t(`frequency.every.${trigger.frequency}`, { n: trigger.interval });
  return trigger.lastDayOfMonth ? t('automations.summary.lastDay', { schedule }) : schedule;
}

/**
 * @typedef {object} AutomationRowProps
 * @property {import('../../../core/services/AutomationService.js').AutomationSummary} summary
 * @property {(id: string) => void} onSelect
 */

/**
 * One automation: its name, when it runs, how many steps, and the next date (or that it stopped).
 * @param {AutomationRowProps} props
 * @returns {import('preact').JSX.Element}
 */
export function AutomationRow({ summary, onSelect }) {
  const { automation, running, nextDate, usesArchived } = summary;
  const count = automation.actions.length;
  const details = [
    automation.triggers.map(describeTrigger).join(' · '),
    count === 1 ? t('automations.stepsOne') : t('automations.steps', { count }),
    running
      ? nextDate && t('automations.next', { date: formatDate(nextDate, 'medium') })
      : t('automations.stopped'),
  ].filter(Boolean);
  return (
    <button type="button" className={styles.row} onClick={() => onSelect(automation.id)}>
      <span className={styles.icon}>
        <Icon name="bolt" />
      </span>
      <span className={styles.text}>
        <span className={styles.title}>{automation.name}</span>
        <span className={styles.details}>{details.join(' · ')}</span>
        {usesArchived && (
          <span className={styles.warning}>
            <Icon name="alert" />
            {t('automations.usesArchived')}
          </span>
        )}
      </span>
      <Icon name="chevronRight" />
    </button>
  );
}
