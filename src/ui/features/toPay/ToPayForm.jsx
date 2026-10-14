import { Button } from '../../components/Button.jsx';
import { DateInput } from '../../components/DateInput.jsx';
import { InlineMessage } from '../../components/InlineMessage.jsx';
import { TransactionFields } from '../../components/TransactionFields.jsx';
import { useFormState } from '../../hooks/useFormState.js';
import { t } from '../../i18n/i18n.js';
import styles from './ToPayForm.module.css';

/** @typedef {import('../../components/TransactionFields.jsx').TransactionDraft} TransactionDraft */
/** @typedef {TransactionDraft & { dueDate: string }} ToPayDraft `date` is unused */

/**
 * @typedef {object} ToPayFormProps
 * @property {ToPayDraft} initial
 * @property {readonly (import('../../components/itemOption.js').AccountChoice & { currency: string })[]} accounts
 * @property {readonly import('../../components/itemOption.js').CategoryChoice[]} categories
 * @property {(draft: ToPayDraft) => Promise<void>} onSubmit throws ValidationError for inline errors
 * @property {() => void} onCancel
 * @property {(draft: ToPayDraft) => Promise<void>} [onPay] shown when editing; saves, then pays
 * @property {() => void} [onDelete] shown when editing
 * @property {readonly import('../../components/TransactionFields.jsx').PayeeSuggestion[]} [payeeSuggestions]
 */

/**
 * Add/edit form for a To pay: the transaction it will record, without a date, and an optional due
 * date.
 * @param {ToPayFormProps} props
 * @returns {import('preact').JSX.Element}
 */
export function ToPayForm({
  initial,
  accounts,
  categories,
  onSubmit,
  onCancel,
  onPay,
  onDelete,
  payeeSuggestions,
}) {
  const form = useFormState(initial);
  const error = form.errors.value.dueDate;

  /** @param {SubmitEvent} event */
  const handleSubmit = async (event) => {
    event.preventDefault();
    await form.submit(onSubmit);
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <TransactionFields
        value={form.draft.value}
        onChange={form.update}
        errors={form.errors.value}
        accounts={accounts}
        categories={categories}
        payeeSuggestions={payeeSuggestions}
        autofillAccount={!onDelete}
        showDate={false}
      />
      <DateInput
        label={t('common.optional', { label: t('toPay.dueDate') })}
        hint={t('toPay.dueDateHint')}
        value={form.draft.value.dueDate}
        error={error ? t(error) : null}
        onInput={(dueDate) => form.update({ dueDate })}
      />
      {onPay && <p className={styles.hint}>{t('toPay.payHint')}</p>}
      {form.formError.value && <InlineMessage tone="error">{form.formError.value}</InlineMessage>}
      <div className={styles.actions}>
        {onDelete && (
          <Button variant="danger" icon="trash" onClick={onDelete}>
            {t('common.delete')}
          </Button>
        )}
        <span className={styles.spacer} />
        <Button onClick={onCancel}>{t('common.cancel')}</Button>
        {onPay && (
          <Button disabled={form.busy.value} onClick={() => void form.submit(onPay)}>
            {t('toPay.pay')}
          </Button>
        )}
        <Button type="submit" variant="primary" disabled={form.busy.value}>
          {form.busy.value ? t('common.saving') : t('toPay.save')}
        </Button>
      </div>
    </form>
  );
}
