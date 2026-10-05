import { Button } from '../../components/Button.jsx';
import { Icon } from '../../components/Icon.jsx';
import { t } from '../../i18n/i18n.js';
import styles from './EntryRow.module.css';

/**
 * @typedef {object} EntryRowProps
 * @property {string} text the item as a short line
 * @property {(() => void) | null} onOpen opens the item's window; null when there is nothing to edit
 * @property {() => void} onRemove
 * @property {string} removeLabel e.g. "Remove this step"
 * @property {boolean} needsAttention saving reported an error inside this item
 */

/**
 * One "When", check, or step on the automation page: a short line that opens the item's window,
 * and a delete button.
 * @param {EntryRowProps} props
 * @returns {import('preact').JSX.Element}
 */
export function EntryRow({ text, onOpen, onRemove, removeLabel, needsAttention }) {
  const content = (
    <>
      <span className={styles.text}>{text}</span>
      {needsAttention && (
        <span className={styles.attention}>
          <Icon name="alert" />
          {t('automations.needsAttention')}
        </span>
      )}
    </>
  );
  return (
    <div className={`${styles.row} ${needsAttention ? styles.invalid : ''}`}>
      {onOpen ? (
        <button type="button" className={styles.open} onClick={onOpen}>
          {content}
          <span className={styles.chevron}>
            <Icon name="chevronRight" />
          </span>
        </button>
      ) : (
        <span className={styles.static}>{content}</span>
      )}
      <Button variant="ghost" icon="trash" aria-label={removeLabel} onClick={onRemove} />
    </div>
  );
}
