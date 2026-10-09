import { useSignal } from '@preact/signals';
import { t } from '../i18n/i18n.js';
import { ComboBox } from './ComboBox.jsx';
import { DateInput } from './DateInput.jsx';
import { IconSelect } from './IconSelect.jsx';
import { itemOption } from './itemOption.js';
import { MoneyInput } from './MoneyInput.jsx';
import { SegmentedControl } from './SegmentedControl.jsx';
import { TextField } from './TextField.jsx';
import styles from './TransactionFields.module.css';

/**
 * Form draft for a transaction or an automation's transaction template. All values are strings
 * as typed.
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
 * @property {readonly (AccountChoice & { currency: string })[]} accounts
 * @property {readonly CategoryChoice[]} categories
 * @property {boolean} [showDate]
 * @property {boolean} [showAmount] false when the amount is entered elsewhere (automation steps)
 * @property {{ payee?: import('preact').ComponentChildren, note?: import('preact').ComponentChildren }} [addons]
 *   shown right under the payee or note field (help for automation fill-in words)
 * @property {readonly PayeeSuggestion[]} [payeeSuggestions] most recent first
 * @property {boolean} [autofillAccount] whether a known payee may also set the account (new entries)
 */

/** @typedef {import('./itemOption.js').AccountChoice} AccountChoice */
/** @typedef {import('./itemOption.js').CategoryChoice} CategoryChoice */

/**
 * A payee used before, with the kind, category, and account of its latest use.
 * @typedef {object} PayeeSuggestion
 * @property {string} payee
 * @property {string} kind
 * @property {string | null} categoryId
 * @property {string} accountId
 */

/**
 * @param {string} payee
 * @returns {string}
 */
function payeeKey(payee) {
  return payee.trim().toLocaleLowerCase();
}

const KIND_OPTIONS = ['expense', 'income', 'transfer'];

/**
 * The fields shared by the transaction form and automation steps: amount first (focused when
 * the dialog opens, decimal keyboard), then type and payee, then category, account, and date, then
 * the note. The payee suggests earlier payees; choosing one fills an empty category (and its type)
 * and, when `autofillAccount` is set and the user hasn't picked one, the account.
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
  showAmount = true,
  addons = {},
  payeeSuggestions = [],
  autofillAccount = false,
}) {
  const accountTouched = useSignal(false);
  const isTransfer = value.kind === 'transfer';
  const currency = accounts.find((a) => a.id === value.accountId)?.currency ?? 'EUR';
  /**
   * @param {string} field
   * @returns {string | null}
   */
  const error = (field) => (errors[field] ? t(errors[field]) : null);
  const choose = { value: '', label: t('common.choose') };
  const accountOptions = [choose, ...accounts.map((a) => itemOption(a))];

  /** @param {string} payee */
  const changePayee = (payee) => {
    /** @type {Partial<TransactionDraft>} */
    const patch = { payee };
    const key = payeeKey(payee);
    const known = key ? payeeSuggestions.find((s) => payeeKey(s.payee) === key) : undefined;
    if (known) {
      const category = categories.find((c) => c.id === known.categoryId && c.kind === known.kind);
      if (!isTransfer && !value.categoryId && category) {
        patch.kind = category.kind;
        patch.categoryId = category.id;
      }
      if (
        autofillAccount &&
        !accountTouched.peek() &&
        accounts.some((a) => a.id === known.accountId)
      ) {
        patch.accountId = known.accountId;
      }
    }
    onChange(patch);
  };

  return (
    <div className={styles.root}>
      {showAmount && (
        <MoneyInput
          label={t('transactions.amount')}
          value={value.amount}
          currency={currency}
          error={error('amount')}
          required
          initialFocus
          onInput={(amount) => onChange({ amount })}
        />
      )}
      <SegmentedControl
        legend={t('transactions.kind')}
        value={value.kind}
        options={KIND_OPTIONS.map((kind) => ({ value: kind, label: t(`kind.${kind}`) }))}
        onChange={(kind) => {
          const keep = categories.some((c) => c.id === value.categoryId && c.kind === kind);
          onChange({ kind, categoryId: keep ? value.categoryId : '' });
        }}
      />
      <ComboBox
        label={t('common.optional', { label: t('transactions.payee') })}
        value={value.payee}
        error={error('payee')}
        options={payeeSuggestions.map((s) => {
          // Shows what choosing the payee fills in.
          const category = categories.find((c) => c.id === s.categoryId);
          return {
            value: s.payee,
            detail: category?.name,
            icon: category?.icon,
            color: category?.color,
          };
        })}
        onInput={changePayee}
      />
      {addons.payee}
      {!isTransfer && (
        <IconSelect
          label={t('common.optional', { label: t('transactions.category') })}
          value={value.categoryId}
          options={[
            { value: '', label: t('transactions.uncategorized'), icon: 'help' },
            ...categories.filter((c) => c.kind === value.kind).map((c) => itemOption(c)),
          ]}
          error={error('categoryId')}
          onChange={(categoryId) => onChange({ categoryId })}
        />
      )}
      <div className={styles.pair}>
        <IconSelect
          label={isTransfer ? t('transactions.fromAccount') : t('transactions.account')}
          value={value.accountId}
          options={accountOptions}
          error={error('accountId')}
          onChange={(accountId) => {
            accountTouched.value = true;
            onChange({ accountId });
          }}
        />
        {isTransfer && (
          <IconSelect
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
        label={t('common.optional', { label: t('transactions.note') })}
        value={value.note}
        error={error('note')}
        autoComplete="off"
        onInput={(note) => onChange({ note })}
      />
      {addons.note}
    </div>
  );
}
