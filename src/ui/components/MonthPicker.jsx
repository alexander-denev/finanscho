import { addMonthsToYearMonth } from '../../core/domain/localDate.js';
import { formatMonth, t } from '../i18n/i18n.js';
import { Button } from './Button.jsx';
import styles from './MonthPicker.module.css';

/**
 * @typedef {object} MonthPickerProps
 * @property {string} label accessible name of the group, e.g. "Month"
 * @property {string | null} value 'YYYY-MM', or null for "all months"
 * @property {string} fallback month to step from when value is null
 * @property {(month: string | null) => void} onChange
 * @property {string} [allLabel] when given, the value can be cleared to null and shows this text
 */

/**
 * Previous/next month stepper with the month name in the middle.
 * @param {MonthPickerProps} props
 * @returns {import('preact').JSX.Element}
 */
export function MonthPicker({ label, value, fallback, onChange, allLabel }) {
  const base = value ?? fallback;
  return (
    <div className={styles.root} role="group" aria-label={label}>
      <Button
        variant="ghost"
        icon="chevronLeft"
        aria-label={t('common.previousMonth')}
        onClick={() => onChange(addMonthsToYearMonth(base, value === null ? 0 : -1))}
      />
      <span className={styles.label} aria-live="polite">
        {value === null ? allLabel : formatMonth(value)}
      </span>
      <Button
        variant="ghost"
        icon="chevronRight"
        aria-label={t('common.nextMonth')}
        onClick={() => onChange(addMonthsToYearMonth(base, value === null ? 0 : 1))}
      />
      {allLabel && value !== null && (
        <Button variant="ghost" onClick={() => onChange(null)}>
          {allLabel}
        </Button>
      )}
    </div>
  );
}
