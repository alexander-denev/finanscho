import { FREQUENCIES } from '../../../core/domain/recurrenceSchedule.js';
import { Button } from '../../components/Button.jsx';
import { DateInput } from '../../components/DateInput.jsx';
import { InlineMessage } from '../../components/InlineMessage.jsx';
import { Select } from '../../components/Select.jsx';
import { TextField } from '../../components/TextField.jsx';
import { TransactionFields } from '../../components/TransactionFields.jsx';
import { useFormState } from '../../hooks/useFormState.js';
import { t } from '../../i18n/i18n.js';
import styles from './RecurringForm.module.css';

/**
 * @typedef {import('../../components/TransactionFields.jsx').TransactionDraft & {
 *   frequency: string,
 *   interval: string,
 *   startDate: string,
 *   endDate: string,
 * }} RecurringDraft
 */

/**
 * @typedef {object} RecurringFormProps
 * @property {RecurringDraft} initial
 * @property {boolean} isEdit shows the explanation that edits apply from the start date
 * @property {boolean} [stopped] the rule has ended; explains resuming instead
 * @property {readonly { id: string, name: string, currency: string }[]} accounts
 * @property {readonly { id: string, name: string, kind: string }[]} categories
 * @property {(draft: RecurringDraft) => Promise<void>} onSubmit
 * @property {() => void} onCancel
 * @property {import('preact').ComponentChildren} [extraActions]
 */

/**
 * Create or "edit" (replace from a date) a recurring transaction.
 * @param {RecurringFormProps} props
 * @returns {import('preact').JSX.Element}
 */
export function RecurringForm({
  initial,
  isEdit,
  stopped = false,
  accounts,
  categories,
  onSubmit,
  onCancel,
  extraActions,
}) {
  const form = useFormState(initial);
  const draft = form.draft.value;
  /**
   * @param {string} field
   * @returns {string | null}
   */
  const error = (field) => (form.errors.value[field] ? t(form.errors.value[field]) : null);

  /** @param {SubmitEvent} event */
  const handleSubmit = async (event) => {
    event.preventDefault();
    await form.submit(onSubmit);
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      {isEdit && (
        <InlineMessage>
          {t(stopped ? 'recurring.resumeExplainer' : 'recurring.editExplainer')}
        </InlineMessage>
      )}
      <TransactionFields
        value={draft}
        onChange={form.update}
        errors={form.errors.value}
        accounts={accounts}
        categories={categories}
        showDate={false}
      />
      <div className={styles.schedule}>
        <Select
          label={t('recurring.frequency')}
          value={draft.frequency}
          options={FREQUENCIES.map((f) => ({ value: f, label: t(`frequency.${f}`) }))}
          error={error('frequency')}
          onChange={(frequency) => form.update({ frequency })}
        />
        <TextField
          label={`${t('recurring.interval')} (${t(`recurring.intervalUnit.${draft.frequency}`)})`}
          value={draft.interval}
          inputMode="text"
          error={error('interval')}
          onInput={(interval) => form.update({ interval })}
        />
        <DateInput
          label={t('recurring.startDate')}
          value={draft.startDate}
          error={error('startDate')}
          required
          onInput={(startDate) => form.update({ startDate })}
        />
        <DateInput
          label={t('common.optional', { label: t('recurring.endDate') })}
          value={draft.endDate}
          error={error('endDate')}
          onInput={(endDate) => form.update({ endDate })}
        />
      </div>
      {form.formError.value && <InlineMessage tone="error">{form.formError.value}</InlineMessage>}
      <div className={styles.actions}>
        {extraActions}
        <span className={styles.spacer} />
        <Button onClick={onCancel}>{t('common.cancel')}</Button>
        <Button type="submit" variant="primary" disabled={form.busy.value}>
          {form.busy.value ? t('common.saving') : t('recurring.save')}
        </Button>
      </div>
    </form>
  );
}
