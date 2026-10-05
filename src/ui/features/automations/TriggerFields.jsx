import { WEEKEND_RULES } from '../../../core/domain/automation.js';
import { daysInMonth } from '../../../core/domain/localDate.js';
import { NTH_VALUES, REPEAT_UNITS } from '../../../core/domain/repeatSchedule.js';
import { SegmentedControl } from '../../components/SegmentedControl.jsx';
import { Select } from '../../components/Select.jsx';
import { TextField } from '../../components/TextField.jsx';
import { t } from '../../i18n/i18n.js';
import { monthName, weekdayName } from './automationText.js';
import styles from './TriggerFields.module.css';

/** @typedef {import('./automationDraft.js').TriggerDraft} TriggerDraft */

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];
const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
/** Choices offered for "First time" at most, so a large "every" keeps the list short. */
const MAX_FIRST_ROUNDS = 60;

/**
 * @typedef {object} TriggerFieldsProps
 * @property {TriggerDraft} value
 * @property {Record<string, string>} errors this schedule's errors (path prefix removed)
 * @property {(patch: Partial<TriggerDraft>) => void} onChange
 */

/**
 * @param {number} count
 * @returns {number[]} 0 … count − 1
 */
function range(count) {
  return Array.from({ length: count }, (_, i) => i);
}

/**
 * A schedule, laid out like a calendar's custom repeat: "Repeat every [N] [days / weeks / months /
 * years]", then which days (weekday toggles, a day of the month or the Nth weekday, or a date of
 * the year), which round comes first when N is 2 or more, and the weekend rule where a date can
 * fall on a weekend.
 * @param {TriggerFieldsProps} props
 * @returns {import('preact').JSX.Element}
 */
export function TriggerFields({ value, errors, onChange }) {
  /**
   * @param {string} field
   * @returns {string | null}
   */
  const error = (field) => (errors[field] ? t(errors[field]) : null);
  const every = Number(value.every);
  const plural = every === 1 ? 'one' : 'other';
  const month = Number(value.month);
  const weekendApplies =
    value.unit === 'year' || (value.unit === 'month' && value.monthMode === 'day');
  const rounds = Number.isInteger(every) && every >= 2 ? Math.min(every, MAX_FIRST_ROUNDS) : 0;

  /**
   * @param {number} weekday
   * @returns {void}
   */
  const toggleWeekday = (weekday) =>
    onChange({
      weekdays: value.weekdays.includes(weekday)
        ? value.weekdays.filter((d) => d !== weekday)
        : [...value.weekdays, weekday].sort((a, b) => a - b),
    });

  return (
    <div className={styles.root}>
      <div className={styles.repeat}>
        <TextField
          label={t('automations.repeatEvery')}
          value={value.every}
          error={error('every')}
          autoComplete="off"
          data-autofocus=""
          onInput={(next) => onChange({ every: next, firstRound: '0' })}
        />
        <Select
          label={t('automations.unit')}
          value={value.unit}
          options={REPEAT_UNITS.map((unit) => ({
            value: unit,
            label: t(`automations.unit.${unit}.${plural}`),
          }))}
          error={error('unit')}
          onChange={(unit) =>
            onChange({ unit: /** @type {TriggerDraft['unit']} */ (unit), firstRound: '0' })
          }
        />
      </div>

      {value.unit === 'week' && (
        <fieldset className={styles.weekdays}>
          <legend className={styles.legend}>{t('automations.onDays')}</legend>
          <div className={styles.toggles}>
            {WEEKDAYS.map((weekday) => (
              <button
                key={weekday}
                type="button"
                className={styles.toggle}
                aria-pressed={value.weekdays.includes(weekday)}
                aria-label={weekdayName(weekday, 'long')}
                onClick={() => toggleWeekday(weekday)}
              >
                {weekdayName(weekday, 'short')}
              </button>
            ))}
          </div>
          {error('weekdays') && (
            <p className={styles.error} role="alert">
              {error('weekdays')}
            </p>
          )}
        </fieldset>
      )}

      {value.unit === 'month' && (
        <>
          <SegmentedControl
            legend={t('automations.monthMode')}
            value={value.monthMode}
            options={[
              { value: 'day', label: t('automations.monthMode.day') },
              { value: 'weekday', label: t('automations.monthMode.weekday') },
            ]}
            onChange={(monthMode) =>
              onChange({ monthMode: /** @type {TriggerDraft['monthMode']} */ (monthMode) })
            }
          />
          {value.monthMode === 'day' ? (
            <Select
              label={t('automations.dayOfMonth')}
              value={value.day}
              options={range(31).map((i) => ({
                value: String(i + 1),
                label: i + 1 === 31 ? t('automations.lastDay') : String(i + 1),
              }))}
              error={error('day')}
              onChange={(day) => onChange({ day })}
            />
          ) : (
            <div className={styles.pair}>
              <Select
                label={t('automations.nth')}
                value={value.nth}
                options={NTH_VALUES.map((nth) => ({
                  value: String(nth),
                  label: t(`automations.nthLabel.${nth}`),
                }))}
                error={error('nth')}
                onChange={(nth) => onChange({ nth })}
              />
              <Select
                label={t('automations.weekdayLabel')}
                value={value.weekday}
                options={WEEKDAYS.map((d) => ({ value: String(d), label: weekdayName(d, 'long') }))}
                error={error('weekday')}
                onChange={(weekday) => onChange({ weekday })}
              />
            </div>
          )}
        </>
      )}

      {value.unit === 'year' && (
        <div className={styles.pair}>
          <Select
            label={t('automations.month')}
            value={value.month}
            options={MONTHS.map((m) => ({ value: String(m), label: monthName(m) }))}
            error={error('month')}
            onChange={(next) =>
              onChange({
                month: next,
                day: String(Math.min(Number(value.day), daysInMonth(2024, Number(next)))),
              })
            }
          />
          <Select
            label={t('automations.dayOfMonth')}
            value={value.day}
            options={range(daysInMonth(2024, month >= 1 && month <= 12 ? month : 1)).map((i) => ({
              value: String(i + 1),
              label: String(i + 1),
            }))}
            error={error('day')}
            onChange={(day) => onChange({ day })}
          />
        </div>
      )}

      {rounds > 0 && (
        <Select
          label={t('automations.firstTime')}
          hint={t('automations.firstTimeHint')}
          value={value.firstRound}
          options={range(rounds).map((k) => ({
            value: String(k),
            label:
              k < 2
                ? t(`automations.first.${value.unit}.${k}`)
                : t(`automations.first.${value.unit}.n`, { n: k }),
          }))}
          error={error('phase')}
          onChange={(firstRound) => onChange({ firstRound })}
        />
      )}

      {weekendApplies && (
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
      )}
    </div>
  );
}
