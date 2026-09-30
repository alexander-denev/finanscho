import { controlClassName, Field } from './Field.jsx';

/** @typedef {{ value: string, label: string, disabled?: boolean }} SelectOption */

/**
 * @typedef {object} SelectProps
 * @property {string} label
 * @property {string} value
 * @property {readonly SelectOption[]} options
 * @property {(value: string) => void} onChange
 * @property {string} [hint]
 * @property {string | null} [error]
 * @property {boolean} [required]
 * @property {boolean} [disabled]
 */

/**
 * A labelled native select. Selects use `onChange`.
 * @param {SelectProps} props
 * @returns {import('preact').JSX.Element}
 */
export function Select({ label, value, options, onChange, hint, error, ...rest }) {
  return (
    <Field label={label} hint={hint} error={error}>
      {({ id, describedBy, invalid }) => (
        <select
          id={id}
          className={controlClassName}
          value={value}
          aria-describedby={describedBy}
          aria-invalid={invalid}
          onChange={(event) => onChange(event.currentTarget.value)}
          {...rest}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}
