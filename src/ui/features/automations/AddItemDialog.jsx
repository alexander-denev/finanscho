import { Dialog } from '../../components/Dialog.jsx';
import styles from './AddItemDialog.module.css';

/**
 * @typedef {object} AddItemOption
 * @property {string} value
 * @property {string} label
 * @property {string} [description]
 */

/**
 * @typedef {object} AddItemDialogProps
 * @property {boolean} open
 * @property {string} title e.g. "Add a When"
 * @property {readonly AddItemOption[]} options
 * @property {(value: string) => void} onChoose
 * @property {() => void} onClose
 */

/**
 * Asks which kind of item to add. The kind is fixed once the item exists.
 * @param {AddItemDialogProps} props
 * @returns {import('preact').JSX.Element}
 */
export function AddItemDialog({ open, title, options, onChoose, onClose }) {
  return (
    <Dialog open={open} title={title} onClose={onClose}>
      <ul className={styles.options}>
        {options.map((option, i) => (
          <li key={option.value}>
            <button
              type="button"
              className={styles.option}
              data-autofocus={i === 0 ? '' : undefined}
              onClick={() => onChoose(option.value)}
            >
              <span className={styles.label}>{option.label}</span>
              {option.description && (
                <span className={styles.description}>{option.description}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
