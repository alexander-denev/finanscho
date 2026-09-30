import { controlClassName, Field } from './Field.jsx';

/**
 * @typedef {object} DateInputProps
 * @property {string} label
 * @property {string} value 'YYYY-MM-DD' or ''
 * @property {(value: string) => void} onInput
 * @property {string} [hint]
 * @property {string | null} [error]
 * @property {boolean} [required]
 * @property {string} [min]
 * @property {string} [max]
 */

/**
 * A native date input. The value is a local calendar date string, never a timestamp.
 * @param {DateInputProps} props
 * @returns {import('preact').JSX.Element}
 */
export function DateInput({ label, value, onInput, hint, error, ...rest }) {
  return (
    <Field label={label} hint={hint} error={error}>
      {({ id, describedBy, invalid }) => (
        <input
          id={id}
          className={controlClassName}
          type="date"
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
