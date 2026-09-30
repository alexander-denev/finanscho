import { useId } from 'preact/hooks';
import styles from './SwatchPicker.module.css';

/**
 * @typedef {object} SwatchPickerProps
 * @property {string} legend
 * @property {string | null} value
 * @property {readonly { value: string, label: string }[]} options swatch keys with names
 * @property {(value: string) => void} onChange
 */

/**
 * Radio group of color swatches. Each swatch has a text name for assistive technology.
 * @param {SwatchPickerProps} props
 * @returns {import('preact').JSX.Element}
 */
export function SwatchPicker({ legend, value, options, onChange }) {
  const name = useId();
  return (
    <fieldset className={styles.root}>
      <legend className={styles.legend}>{legend}</legend>
      <div className={styles.options}>
        {options.map((option) => (
          <label key={option.value} className={styles.option} title={option.label}>
            <input
              className={styles.input}
              type="radio"
              name={name}
              value={option.value}
              checked={option.value === value}
              onChange={() => onChange(option.value)}
            />
            <span
              className={styles.swatch}
              style={{ '--swatch': `var(--sw-${option.value})` }}
              aria-hidden="true"
            />
            <span className="visually-hidden">{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
