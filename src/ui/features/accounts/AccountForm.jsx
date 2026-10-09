import { ACCOUNT_TYPE_ICONS, ACCOUNT_TYPES, SWATCHES } from '../../../core/domain/account.js';
import { Button } from '../../components/Button.jsx';
import { ColorPicker } from '../../components/ColorPicker.jsx';
import { IconPicker } from '../../components/IconPicker.jsx';
import { InlineMessage } from '../../components/InlineMessage.jsx';
import { MoneyInput } from '../../components/MoneyInput.jsx';
import { Select } from '../../components/Select.jsx';
import { TextField } from '../../components/TextField.jsx';
import { useFormState } from '../../hooks/useFormState.js';
import { t } from '../../i18n/i18n.js';
import styles from './AccountForm.module.css';

/**
 * @typedef {object} AccountDraft
 * @property {string} name
 * @property {string} type
 * @property {string} currency
 * @property {string} openingBalance
 * @property {string | null} color
 * @property {string | null} icon null shows the type's icon
 */

/**
 * @typedef {object} AccountFormProps
 * @property {AccountDraft} initial
 * @property {boolean} isNew currency can only be chosen when creating
 * @property {(draft: AccountDraft) => Promise<void>} onSubmit
 * @property {() => void} onCancel
 * @property {import('preact').ComponentChildren} [extraActions] e.g. archive, shown when editing
 */

/**
 * Create/edit form for an account.
 * @param {AccountFormProps} props
 * @returns {import('preact').JSX.Element}
 */
export function AccountForm({ initial, isNew, onSubmit, onCancel, extraActions }) {
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
      <TextField
        label={t('accounts.name')}
        value={draft.name}
        error={error('name')}
        required
        onInput={(name) => form.update({ name })}
      />
      <Select
        label={t('accounts.type')}
        value={draft.type}
        options={ACCOUNT_TYPES.map((type) => ({ value: type, label: t(`accountType.${type}`) }))}
        error={error('type')}
        onChange={(type) => form.update({ type })}
      />
      {isNew && (
        <TextField
          label={t('accounts.currency')}
          value={draft.currency}
          hint={t('accounts.currencyHint')}
          error={error('currency')}
          maxLength={3}
          autoComplete="off"
          onInput={(currency) => form.update({ currency: currency.toUpperCase() })}
        />
      )}
      <MoneyInput
        label={t('accounts.openingBalance')}
        value={draft.openingBalance}
        currency={/^[A-Z]{3}$/.test(draft.currency) ? draft.currency : 'EUR'}
        hint={t('accounts.openingBalanceHint')}
        error={error('openingBalance')}
        allowNegative
        onInput={(openingBalance) => form.update({ openingBalance })}
      />
      <ColorPicker
        label={t('accounts.color')}
        value={draft.color}
        options={SWATCHES.map((swatch) => ({ value: swatch, label: t(`swatch.${swatch}`) }))}
        customLabel={t('swatch.custom')}
        onChange={(color) => form.update({ color })}
      />
      <IconPicker
        label={t('accounts.icon')}
        value={draft.icon}
        color={draft.color}
        automatic={{
          icon: ACCOUNT_TYPE_ICONS[/** @type {keyof typeof ACCOUNT_TYPE_ICONS} */ (draft.type)],
          label: t('accounts.iconAutomatic', { type: t(`accountType.${draft.type}`) }),
        }}
        onChange={(icon) => form.update({ icon })}
      />
      {form.formError.value && <InlineMessage tone="error">{form.formError.value}</InlineMessage>}
      <div className={styles.actions}>
        {extraActions}
        <span className={styles.spacer} />
        <Button onClick={onCancel}>{t('common.cancel')}</Button>
        <Button type="submit" variant="primary" disabled={form.busy.value}>
          {form.busy.value ? t('common.saving') : t('accounts.save')}
        </Button>
      </div>
    </form>
  );
}
