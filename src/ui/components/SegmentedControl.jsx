import { useId } from 'preact/hooks';
import styles from './SegmentedControl.module.css';

/**
 * @typedef {object} SegmentedControlProps
 * @property {string} legend
 * @property {string} value
 * @property {readonly { value: string, label: string }[]} options
 * @property {(value: string) => void} onChange
 */

/**
 * A radio group styled as a segmented control (radios use `onChange`).
 * @param {SegmentedControlProps} props
 * @returns {import('preact').JSX.Element}
 */
export function SegmentedControl({ legend, value, options, onChange }) {
  const name = useId();
  return (
    <fieldset className={styles.root}>
      <legend className={styles.legend}>{legend}</legend>
      <div className={styles.options}>
        {options.map((option) => (
          <label key={option.value} className={styles.option}>
            <input
              className={styles.input}
              type="radio"
              name={name}
              value={option.value}
              checked={option.value === value}
              onChange={() => onChange(option.value)}
            />
            <span className={styles.text}>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
