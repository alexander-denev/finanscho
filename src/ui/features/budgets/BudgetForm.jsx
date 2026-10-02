import { Button } from '../../components/Button.jsx';
import { InlineMessage } from '../../components/InlineMessage.jsx';
import { MoneyInput } from '../../components/MoneyInput.jsx';
import { Select } from '../../components/Select.jsx';
import { Switch } from '../../components/Switch.jsx';
import { useFormState } from '../../hooks/useFormState.js';
import { t } from '../../i18n/i18n.js';
import styles from './BudgetForm.module.css';

/** @typedef {{ categoryId: string, limit: string, recurring: boolean }} BudgetDraft */

/**
 * @typedef {object} BudgetFormProps
 * @property {BudgetDraft} initial
 * @property {readonly { id: string, name: string }[]} categories choosable categories (a fixed one when editing)
 * @property {string} currency
 * @property {(draft: BudgetDraft) => Promise<void>} onSubmit
 * @property {() => void} onCancel
 * @property {(() => void) | undefined} onRemove shown when editing
 */

/**
 * Set or change the monthly limit for an expense category.
 * @param {BudgetFormProps} props
 * @returns {import('preact').JSX.Element}
 */
export function BudgetForm({ initial, categories, currency, onSubmit, onCancel, onRemove }) {
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
      <Select
        label={t('budgets.category')}
        value={draft.categoryId}
        options={[
          ...(onRemove ? [] : [{ value: '', label: t('common.choose') }]),
          ...categories.map((c) => ({ value: c.id, label: c.name })),
        ]}
        disabled={Boolean(onRemove)}
        error={error('categoryId')}
        onChange={(categoryId) => form.update({ categoryId })}
      />
      <MoneyInput
        label={t('budgets.limit')}
        value={draft.limit}
        currency={currency}
        error={error('limit')}
        required
        onInput={(limit) => form.update({ limit })}
      />
      <Switch
        label={t('budgets.recurring')}
        hint={t('budgets.recurringHint')}
        checked={draft.recurring}
        onChange={(recurring) => form.update({ recurring })}
      />
      {form.formError.value && <InlineMessage tone="error">{form.formError.value}</InlineMessage>}
      <div className={styles.actions}>
        {onRemove && (
          <Button variant="danger" onClick={onRemove}>
            {t('budgets.remove')}
          </Button>
        )}
        <span className={styles.spacer} />
        <Button onClick={onCancel}>{t('common.cancel')}</Button>
        <Button type="submit" variant="primary" disabled={form.busy.value}>
          {form.busy.value ? t('common.saving') : t('budgets.save')}
        </Button>
      </div>
    </form>
  );
}
