import { TRIGGER_TYPES, WEEKEND_RULES } from '../../../core/domain/automation.js';
import { FREQUENCIES } from '../../../core/domain/recurrenceSchedule.js';
import { Button } from '../../components/Button.jsx';
import { DateInput } from '../../components/DateInput.jsx';
import { Select } from '../../components/Select.jsx';
import { Switch } from '../../components/Switch.jsx';
import { TextField } from '../../components/TextField.jsx';
import { t } from '../../i18n/i18n.js';
import styles from './TriggerFields.module.css';

/** @typedef {import('./automationDraft.js').TriggerDraft} TriggerDraft */

/**
 * @typedef {object} TriggerFieldsProps
 * @property {TriggerDraft} value
 * @property {Record<string, string>} errors this trigger's errors (path prefix removed)
 * @property {(patch: Partial<TriggerDraft>) => void} onChange
 * @property {(() => void) | null} onRemove null when it is the only trigger
 */

/**
 * One "When": a schedule (how often, from which date, last day of the month, what to do on
 * weekends) or "a transaction is recorded".
 * @param {TriggerFieldsProps} props
 * @returns {import('preact').JSX.Element}
 */
export function TriggerFields({ value, errors, onChange, onRemove }) {
  /**
   * @param {string} field
   * @returns {string | null}
   */
  const error = (field) => (errors[field] ? t(errors[field]) : null);
  const monthly = value.frequency === 'monthly' || value.frequency === 'yearly';
  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <Select
          label={t('automations.triggerType')}
          value={value.type}
          options={TRIGGER_TYPES.map((type) => ({
            value: type,
            label: t(`automations.trigger.${type}`),
          }))}
          error={error('type')}
          onChange={(type) => onChange({ type: /** @type {TriggerDraft['type']} */ (type) })}
        />
        {onRemove && (
          <Button
            variant="ghost"
            icon="trash"
            aria-label={t('automations.removeTrigger')}
            onClick={onRemove}
          />
        )}
      </div>
      {value.type === 'schedule' && (
        <div className={styles.grid}>
          <Select
            label={t('automations.frequency')}
            value={value.frequency}
            options={FREQUENCIES.map((f) => ({ value: f, label: t(`frequency.${f}`) }))}
            error={error('frequency')}
            onChange={(frequency) =>
              onChange({
                frequency,
                lastDayOfMonth:
                  frequency === 'monthly' || frequency === 'yearly' ? value.lastDayOfMonth : false,
              })
            }
          />
          <TextField
            label={`${t('automations.interval')} (${t(`automations.intervalUnit.${value.frequency}`)})`}
            value={value.interval}
            error={error('interval')}
            onInput={(interval) => onChange({ interval })}
          />
          <DateInput
            label={t('automations.firstDate')}
            value={value.firstDate}
            error={error('firstDate')}
            required
            onInput={(firstDate) => onChange({ firstDate })}
          />
          <Select
            label={t('automations.weekend')}
            value={value.weekend}
            options={WEEKEND_RULES.map((rule) => ({
              value: rule,
              label: t(`automations.weekend.${rule}`),
            }))}
            error={error('weekend')}
            onChange={(weekend) => onChange({ weekend })}
          />
        </div>
      )}
      {value.type === 'schedule' && monthly && (
        <Switch
          label={t('automations.lastDayOfMonth')}
          checked={value.lastDayOfMonth}
          onChange={(lastDayOfMonth) => onChange({ lastDayOfMonth })}
        />
      )}
    </div>
  );
}
