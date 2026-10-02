import { useId } from 'preact/hooks';
import styles from './Switch.module.css';

/**
 * @typedef {object} SwitchProps
 * @property {string} label
 * @property {boolean} checked
 * @property {(checked: boolean) => void} onChange
 * @property {string} [hint]
 */

/**
 * An on/off switch: a native checkbox with `role="switch"` (checkboxes use `onChange`).
 * @param {SwitchProps} props
 * @returns {import('preact').JSX.Element}
 */
export function Switch({ label, checked, onChange, hint }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className={styles.root}>
      <label className={styles.row} htmlFor={id}>
        <span className={styles.label}>{label}</span>
        <input
          id={id}
          className={styles.input}
          type="checkbox"
          role="switch"
          checked={checked}
          aria-describedby={hintId}
          onChange={(event) => onChange(event.currentTarget.checked)}
        />
        <span className={styles.track} aria-hidden="true" />
      </label>
      {hint && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
    </div>
  );
}
