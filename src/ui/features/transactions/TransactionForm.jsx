import { Button } from '../../components/Button.jsx';
import { InlineMessage } from '../../components/InlineMessage.jsx';
import { TransactionFields } from '../../components/TransactionFields.jsx';
import { useFormState } from '../../hooks/useFormState.js';
import { t } from '../../i18n/i18n.js';
import styles from './TransactionForm.module.css';

/** @typedef {import('../../components/TransactionFields.jsx').TransactionDraft} TransactionDraft */

/**
 * @typedef {object} TransactionFormProps
 * @property {TransactionDraft} initial
 * @property {readonly { id: string, name: string, currency: string }[]} accounts
 * @property {readonly { id: string, name: string, kind: string }[]} categories
 * @property {(draft: TransactionDraft) => Promise<void>} onSubmit throws ValidationError for inline errors
 * @property {() => void} onCancel
 * @property {() => void} [onDelete] shown when editing
 * @property {readonly import('../../components/TransactionFields.jsx').PayeeSuggestion[]} [payeeSuggestions]
 */

/**
 * Add/edit form for a transaction.
 * @param {TransactionFormProps} props
 * @returns {import('preact').JSX.Element}
 */
export function TransactionForm({
  initial,
  accounts,
  categories,
  onSubmit,
  onCancel,
  onDelete,
  payeeSuggestions,
}) {
  const form = useFormState(initial);

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
      />
      {form.formError.value && <InlineMessage tone="error">{form.formError.value}</InlineMessage>}
      <div className={styles.actions}>
        {onDelete && (
          <Button variant="danger" icon="trash" onClick={onDelete}>
            {t('common.delete')}
          </Button>
        )}
        <span className={styles.spacer} />
        <Button onClick={onCancel}>{t('common.cancel')}</Button>
        <Button type="submit" variant="primary" disabled={form.busy.value}>
          {form.busy.value ? t('common.saving') : t('transactions.save')}
        </Button>
      </div>
    </form>
  );
}
