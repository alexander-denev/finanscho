import { useId } from 'preact/hooks';
import styles from './Field.module.css';

/** Class for the input/select element inside a Field. */
export const controlClassName = styles.control;

/**
 * @typedef {object} FieldIds
 * @property {string} id the control's id (linked to the label)
 * @property {string | undefined} describedBy ids of the hint and error, for aria-describedby
 * @property {boolean} invalid
 */

/**
 * @typedef {object} FieldProps
 * @property {string} label
 * @property {string} [hint]
 * @property {string | null} [error] user-readable error message
 * @property {(ids: FieldIds) => import('preact').JSX.Element} children renders the control
 * @property {import('preact').ComponentChildren} [prefix] shown inside the control frame, before it
 */

/**
 * Label, control, hint, and inline error, wired together for assistive technology.
 * @param {FieldProps} props
 * @returns {import('preact').JSX.Element}
 */
export function Field({ label, hint, error, children, prefix }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <div className={`${styles.frame} ${error ? styles.invalid : ''}`}>
        {prefix !== undefined && <span className={styles.prefix}>{prefix}</span>}
        {children({ id, describedBy, invalid: Boolean(error) })}
      </div>
      {hint && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}
