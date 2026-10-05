import { CONDITION_OPS } from '../../../core/domain/automation.js';
import { TRANSACTION_KINDS } from '../../../core/domain/transaction.js';
import { Button } from '../../components/Button.jsx';
import { MoneyInput } from '../../components/MoneyInput.jsx';
import { Select } from '../../components/Select.jsx';
import { TextField } from '../../components/TextField.jsx';
import { t } from '../../i18n/i18n.js';
import styles from './ConditionFields.module.css';

/** @typedef {import('./automationDraft.js').ConditionDraft} ConditionDraft */

/**
 * @typedef {object} ConditionPickers
 * @property {readonly { id: string, name: string, currency: string }[]} accounts
 * @property {readonly { id: string, name: string, kind: string }[]} categories
 * @property {readonly string[]} currencies currencies of the user's accounts
 */

/**
 * @typedef {object} ConditionFieldsProps
 * @property {ConditionDraft} value
 * @property {Record<string, string>} errors this check's errors (path prefix removed)
 * @property {(patch: Partial<ConditionDraft>) => void} onChange
 * @property {(() => void) | null} onRemove shown inside a group; a lone check is removed from its window
 * @property {ConditionPickers} pickers
 */

/**
 * One check on the recorded transaction: how to compare, and the value. What it looks at (the
 * field) was chosen when the check was added and doesn't change.
 * @param {ConditionFieldsProps} props
 * @returns {import('preact').JSX.Element}
 */
export function ConditionFields({ value, errors, onChange, onRemove, pickers }) {
  /**
   * @param {string} field
   * @returns {string | null}
   */
  const error = (field) => (errors[field] ? t(errors[field]) : null);
  const field = /** @type {keyof typeof CONDITION_OPS} */ (value.field);
  const ops = CONDITION_OPS[field] ?? ['is'];
  const choose = { value: '', label: t('common.choose') };

  /** @returns {import('preact').JSX.Element | null} */
  const valueControl = () => {
    switch (field) {
      case 'account':
      case 'toAccount':
        return (
          <Select
            label={t('automations.value')}
            value={value.accountId}
            options={[choose, ...pickers.accounts.map((a) => ({ value: a.id, label: a.name }))]}
            error={error('accountId')}
            onChange={(accountId) => onChange({ accountId })}
          />
        );
      case 'kind':
        return (
          <Select
            label={t('automations.value')}
            value={value.kind}
            options={TRANSACTION_KINDS.map((kind) => ({ value: kind, label: t(`kind.${kind}`) }))}
            error={error('kind')}
            onChange={(kind) => onChange({ kind })}
          />
        );
      case 'category':
        return value.op === 'isEmpty' ? null : (
          <Select
            label={t('automations.value')}
            value={value.categoryId}
            options={[
              choose,
              ...pickers.categories.map((c) => ({
                value: c.id,
                label: `${c.name} (${t(`kind.${c.kind}`)})`,
              })),
            ]}
            error={error('categoryId')}
            onChange={(categoryId) => onChange({ categoryId })}
          />
        );
      case 'payee':
        return (
          <TextField
            label={t('automations.value')}
            value={value.text}
            error={error('text')}
            autoComplete="off"
            onInput={(text) => onChange({ text })}
          />
        );
      default:
        return (
          <>
            <MoneyInput
              label={t('automations.value')}
              value={value.amount}
              currency={value.currency}
              error={error('amount')}
              onInput={(amount) => onChange({ amount })}
            />
            {pickers.currencies.length > 1 && (
              <Select
                label={t('automations.currency')}
                value={value.currency}
                options={pickers.currencies.map((c) => ({ value: c, label: c }))}
                error={error('currency')}
                onChange={(currency) => onChange({ currency })}
              />
            )}
          </>
        );
    }
  };

  return (
    <div className={onRemove ? styles.row : styles.lone}>
      <div className={styles.fields}>
        {ops.length > 1 ? (
          <Select
            label={t(`automations.field.${field}`)}
            value={value.op}
            options={ops.map((op) => ({ value: op, label: t(`automations.op.${op}`) }))}
            error={error('op')}
            onChange={(op) => onChange({ op })}
          />
        ) : (
          <p className={styles.fixed}>
            {t('automations.text.check', {
              what: t(`automations.field.${field}`),
              how: t(`automations.op.${ops[0]}`),
              value: '',
            })}
          </p>
        )}
        {valueControl()}
      </div>
      {onRemove && (
        <Button
          variant="ghost"
          icon="trash"
          aria-label={t('automations.removeCheck')}
          onClick={onRemove}
        />
      )}
    </div>
  );
}
