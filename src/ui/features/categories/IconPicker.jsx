import { useId } from 'preact/hooks';
import { Icon } from '../../components/Icon.jsx';
import styles from './IconPicker.module.css';

/**
 * @typedef {object} IconPickerProps
 * @property {string} legend
 * @property {string} value
 * @property {readonly { value: import('../../components/Icon.jsx').IconName, label: string }[]} options
 * @property {(value: string) => void} onChange
 */

/**
 * Radio group of category icons, each with a text name.
 * @param {IconPickerProps} props
 * @returns {import('preact').JSX.Element}
 */
export function IconPicker({ legend, value, options, onChange }) {
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
            <span className={styles.icon}>
              <Icon name={option.value} />
            </span>
            <span className="visually-hidden">{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
