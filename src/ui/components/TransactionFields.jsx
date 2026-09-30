import { t } from '../i18n/i18n.js';
import { DateInput } from './DateInput.jsx';
import { MoneyInput } from './MoneyInput.jsx';
import { SegmentedControl } from './SegmentedControl.jsx';
import { Select } from './Select.jsx';
import { TextField } from './TextField.jsx';
import styles from './TransactionFields.module.css';

/**
 * Form draft for a transaction or a recurring template. All values are strings as typed.
 * @typedef {object} TransactionDraft
 * @property {string} kind 'expense' | 'income' | 'transfer'
 * @property {string} amount
 * @property {string} categoryId
 * @property {string} accountId
 * @property {string} toAccountId
 * @property {string} date
 * @property {string} payee
 * @property {string} note
 */

/**
 * @typedef {object} TransactionFieldsProps
 * @property {TransactionDraft} value
 * @property {(patch: Partial<TransactionDraft>) => void} onChange
 * @property {Record<string, string>} errors field → i18n key
 * @property {readonly { id: string, name: string, currency: string }[]} accounts
 * @property {readonly { id: string, name: string, kind: string }[]} categories
 * @property {boolean} [showDate]
 */

const KIND_OPTIONS = ['expense', 'income', 'transfer'];

/**
 * The fields shared by the transaction form and the recurring form: amount first (focused when
 * the dialog opens, decimal keyboard), then type, category, account, and date, then optional payee
 * and note.
 * @param {TransactionFieldsProps} props
 * @returns {import('preact').JSX.Element}
 */
export function TransactionFields({
  value,
  onChange,
  errors,
  accounts,
  categories,
  showDate = true,
}) {
  const isTransfer = value.kind === 'transfer';
  const currency = accounts.find((a) => a.id === value.accountId)?.currency ?? 'EUR';
  /**
   * @param {string} field
   * @returns {string | null}
   */
  const error = (field) => (errors[field] ? t(errors[field]) : null);
  const choose = { value: '', label: t('common.choose') };
  const accountOptions = [choose, ...accounts.map((a) => ({ value: a.id, label: a.name }))];

  return (
    <div className={styles.root}>
      <MoneyInput
        label={t('transactions.amount')}
        value={value.amount}
        currency={currency}
        error={error('amount')}
        required
        initialFocus
        onInput={(amount) => onChange({ amount })}
      />
      <SegmentedControl
        legend={t('transactions.kind')}
        value={value.kind}
        options={KIND_OPTIONS.map((kind) => ({ value: kind, label: t(`kind.${kind}`) }))}
        onChange={(kind) => {
          const keep = categories.some((c) => c.id === value.categoryId && c.kind === kind);
          onChange({ kind, categoryId: keep ? value.categoryId : '' });
        }}
      />
      {!isTransfer && (
        <Select
          label={t('transactions.category')}
          value={value.categoryId}
          options={[
            choose,
            ...categories
              .filter((c) => c.kind === value.kind)
              .map((c) => ({ value: c.id, label: c.name })),
          ]}
          error={error('categoryId')}
          onChange={(categoryId) => onChange({ categoryId })}
        />
      )}
      <div className={styles.pair}>
        <Select
          label={isTransfer ? t('transactions.fromAccount') : t('transactions.account')}
          value={value.accountId}
          options={accountOptions}
          error={error('accountId')}
          onChange={(accountId) => onChange({ accountId })}
        />
        {isTransfer && (
          <Select
            label={t('transactions.toAccount')}
            value={value.toAccountId}
            options={accountOptions}
            error={error('toAccountId')}
            onChange={(toAccountId) => onChange({ toAccountId })}
          />
        )}
        {showDate && (
          <DateInput
            label={t('transactions.date')}
            value={value.date}
            error={error('date')}
            required
            onInput={(date) => onChange({ date })}
          />
        )}
      </div>
      <TextField
        label={t('common.optional', { label: t('transactions.payee') })}
        value={value.payee}
        error={error('payee')}
        autoComplete="off"
        onInput={(payee) => onChange({ payee })}
      />
      <TextField
        label={t('common.optional', { label: t('transactions.note') })}
        value={value.note}
        error={error('note')}
        autoComplete="off"
        onInput={(note) => onChange({ note })}
      />
    </div>
  );
}
