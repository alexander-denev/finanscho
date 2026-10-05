import { Amount } from '../../components/Amount.jsx';
import { Button } from '../../components/Button.jsx';
import { InlineMessage } from '../../components/InlineMessage.jsx';
import { MoneyInput } from '../../components/MoneyInput.jsx';
import { useFormState } from '../../hooks/useFormState.js';
import { t } from '../../i18n/i18n.js';
import styles from './ReconcileForm.module.css';

/**
 * @typedef {object} ReconcileDraft
 * @property {string} balance the counted balance as typed
 */

/**
 * @typedef {object} ReconcileFormProps
 * @property {number} balanceTodayMinor the computed balance at the end of today
 * @property {string} currency
 * @property {(draft: ReconcileDraft) => Promise<void>} onSubmit
 * @property {() => void} onCancel
 */

/**
 * Asks for the balance the user counted and records the difference as a balance adjustment.
 * @param {ReconcileFormProps} props
 * @returns {import('preact').JSX.Element}
 */
export function ReconcileForm({ balanceTodayMinor, currency, onSubmit, onCancel }) {
  const form = useFormState(/** @type {ReconcileDraft} */ ({ balance: '' }));
  const balanceError = form.errors.value.balance;

  /** @param {SubmitEvent} event */
  const handleSubmit = async (event) => {
    event.preventDefault();
    await form.submit(onSubmit);
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <div className={styles.current}>
        <span className={styles.label}>{t('reconcile.balanceToday')}</span>
        <Amount minor={balanceTodayMinor} currency={currency} kind="signed" size="lg" />
      </div>
      <MoneyInput
        label={t('reconcile.actualBalance')}
        value={form.draft.value.balance}
        currency={currency}
        hint={t('reconcile.hint')}
        error={balanceError ? t(balanceError) : null}
        allowNegative
        required
        initialFocus
        onInput={(balance) => form.update({ balance })}
      />
      {form.formError.value && <InlineMessage tone="error">{form.formError.value}</InlineMessage>}
      <div className={styles.actions}>
        <Button onClick={onCancel}>{t('common.cancel')}</Button>
        <Button type="submit" variant="primary" disabled={form.busy.value}>
          {form.busy.value ? t('common.saving') : t('reconcile.save')}
        </Button>
      </div>
    </form>
  );
}
