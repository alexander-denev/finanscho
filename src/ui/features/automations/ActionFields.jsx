import { ACTION_TYPES, AMOUNT_TYPES } from '../../../core/domain/automation.js';
import { Button } from '../../components/Button.jsx';
import { MoneyInput } from '../../components/MoneyInput.jsx';
import { SegmentedControl } from '../../components/SegmentedControl.jsx';
import { Select } from '../../components/Select.jsx';
import { TextField } from '../../components/TextField.jsx';
import { TransactionFields } from '../../components/TransactionFields.jsx';
import { t } from '../../i18n/i18n.js';
import { FillInWordsHelp } from './FillInWordsHelp.jsx';
import styles from './ActionFields.module.css';

/** @typedef {import('./automationDraft.js').ActionDraft} ActionDraft */

/**
 * @typedef {object} ActionFieldsProps
 * @property {ActionDraft} value
 * @property {Record<string, string>} errors this step's errors (path prefix removed)
 * @property {(patch: Partial<ActionDraft>) => void} onChange
 * @property {(() => void) | null} onRemove null when it is the only step
 * @property {boolean} allowPercent every trigger is "a transaction is recorded"
 * @property {readonly { id: string, name: string, currency: string }[]} accounts
 * @property {readonly { id: string, name: string, kind: string }[]} categories
 */

/**
 * Adds a fill-in word at the end of a text, with a space before it when needed.
 * @param {string} text
 * @param {string} word
 * @returns {string}
 */
function appendWord(text, word) {
  if (text === '' || text.endsWith(' ')) return `${text}${word}`;
  return `${text} ${word}`;
}

/**
 * One "Do" step: create a transaction (the usual transaction fields, a fixed amount or a share
 * of the recorded transaction, and fill-in words in payee and note) or set a budget.
 * @param {ActionFieldsProps} props
 * @returns {import('preact').JSX.Element}
 */
export function ActionFields({
  value,
  errors,
  onChange,
  onRemove,
  allowPercent,
  accounts,
  categories,
}) {
  /**
   * @param {string} field
   * @returns {string | null}
   */
  const error = (field) => (errors[field] ? t(errors[field]) : null);
  const percent = value.amountType === 'percent';
  const currency =
    value.type === 'setBudget'
      ? value.currency
      : (accounts.find((a) => a.id === value.accountId)?.currency ?? value.currency);

  const amountFields = (
    <>
      {(allowPercent || percent) && (
        <SegmentedControl
          legend={t('automations.amountType')}
          value={value.amountType}
          options={AMOUNT_TYPES.map((type) => ({
            value: type,
            label: t(`automations.amountType.${type}`),
          }))}
          onChange={(amountType) =>
            onChange({ amountType: /** @type {ActionDraft['amountType']} */ (amountType) })
          }
        />
      )}
      {percent ? (
        <TextField
          label={t('automations.percent')}
          value={value.amount}
          prefix="%"
          error={error('amount')}
          autoComplete="off"
          onInput={(amount) => onChange({ amount })}
        />
      ) : (
        <MoneyInput
          label={
            value.type === 'setBudget' ? t('automations.budgetLimit') : t('automations.amount')
          }
          value={value.amount}
          currency={currency}
          error={error('amount')}
          onInput={(amount) => onChange({ amount })}
        />
      )}
    </>
  );

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <Select
          label={t('automations.actionType')}
          value={value.type}
          options={ACTION_TYPES.map((type) => ({
            value: type,
            label: t(`automations.action.${type}`),
          }))}
          error={error('type')}
          onChange={(type) => onChange({ type: /** @type {ActionDraft['type']} */ (type) })}
        />
        {onRemove && (
          <Button
            variant="ghost"
            icon="trash"
            aria-label={t('automations.removeAction')}
            onClick={onRemove}
          />
        )}
      </div>
      {value.type === 'setBudget' ? (
        <>
          <Select
            label={t('automations.budgetCategory')}
            value={value.budgetCategoryId}
            options={[
              { value: '', label: t('common.choose') },
              ...categories
                .filter((c) => c.kind === 'expense')
                .map((c) => ({ value: c.id, label: c.name })),
            ]}
            error={error('categoryId')}
            onChange={(budgetCategoryId) => onChange({ budgetCategoryId })}
          />
          {amountFields}
          <p className={styles.hint}>{t('automations.budgetHint')}</p>
        </>
      ) : (
        <>
          {amountFields}
          <TransactionFields
            value={value}
            onChange={onChange}
            errors={errors}
            accounts={accounts}
            categories={categories}
            showDate={false}
            showAmount={false}
            addons={{
              payee: (
                <FillInWordsHelp
                  onInsert={(word) => onChange({ payee: appendWord(value.payee, word) })}
                />
              ),
              note: (
                <FillInWordsHelp
                  onInsert={(word) => onChange({ note: appendWord(value.note, word) })}
                />
              ),
            }}
          />
        </>
      )}
    </div>
  );
}
