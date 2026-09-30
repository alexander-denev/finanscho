import { controlClassName, Field } from './Field.jsx';

/**
 * @typedef {object} TextFieldProps
 * @property {string} label
 * @property {string} value
 * @property {(value: string) => void} onInput
 * @property {'text' | 'password' | 'url' | 'search' | 'email'} [type]
 * @property {string} [hint]
 * @property {string | null} [error]
 * @property {boolean} [required]
 * @property {string} [autoComplete]
 * @property {'text' | 'url' | 'search' | 'email'} [inputMode]
 * @property {string} [placeholder]
 * @property {number} [maxLength]
 * @property {boolean} [spellcheck]
 * @property {import('preact').ComponentChildren} [prefix]
 */

/**
 * A labelled single-line text input. Uses `onInput` so the value updates on every keystroke.
 * @param {TextFieldProps} props
 * @returns {import('preact').JSX.Element}
 */
export function TextField({ label, value, onInput, type = 'text', hint, error, prefix, ...rest }) {
  return (
    <Field label={label} hint={hint} error={error} prefix={prefix}>
      {({ id, describedBy, invalid }) => (
        <input
          id={id}
          className={controlClassName}
          type={type}
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
