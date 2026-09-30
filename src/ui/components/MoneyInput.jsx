import { getLocale } from '../i18n/i18n.js';
import { controlClassName, Field } from './Field.jsx';
import styles from './MoneyInput.module.css';

/**
 * The narrow currency symbol in the user locale (for example the euro sign).
 * @param {string} currency
 * @returns {string}
 */
function currencySymbol(currency) {
  try {
    const parts = new Intl.NumberFormat(getLocale(), {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
    }).formatToParts(0);
    return parts.find((p) => p.type === 'currency')?.value ?? currency;
  } catch {
    return currency;
  }
}

/**
 * @typedef {object} MoneyInputProps
 * @property {string} label
 * @property {string} value the typed text; parsed to minor units by the domain layer
 * @property {(value: string) => void} onInput
 * @property {string} currency ISO 4217 code shown as a prefix
 * @property {string} [hint]
 * @property {string | null} [error]
 * @property {boolean} [allowNegative] show a full keyboard so a minus sign can be typed
 * @property {boolean} [required]
 * @property {boolean} [initialFocus] focus this field when its dialog opens
 */

/**
 * Amount input with a decimal keyboard on phones and the currency symbol as a prefix.
 * @param {MoneyInputProps} props
 * @returns {import('preact').JSX.Element}
 */
export function MoneyInput({
  label,
  value,
  onInput,
  currency,
  hint,
  error,
  allowNegative,
  initialFocus,
  ...rest
}) {
  return (
    <Field label={label} hint={hint} error={error} prefix={currencySymbol(currency)}>
      {({ id, describedBy, invalid }) => (
        <input
          id={id}
          className={`${controlClassName} ${styles.amount}`}
          type="text"
          inputMode={allowNegative ? 'text' : 'decimal'}
          autoComplete="off"
          data-autofocus={initialFocus ? '' : undefined}
          value={value}
          aria-describedby={describedBy}
          aria-invalid={invalid}
          onInput={(event) => onInput(event.currentTarget.value)}
          {...rest}
        />
      )}
    </Field>
  );
}
