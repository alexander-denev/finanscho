import { Button } from '../../components/Button.jsx';
import { Dialog } from '../../components/Dialog.jsx';
import { t } from '../../i18n/i18n.js';
import styles from './ItemDialog.module.css';

/**
 * @typedef {object} ItemDialogProps
 * @property {boolean} open
 * @property {string} title
 * @property {() => void} onDone checks the item and puts it on the page
 * @property {() => void} onCancel leaves the page as it was
 * @property {(() => void) | null} onDelete for an item already on the page
 * @property {boolean} busy
 * @property {import('preact').ComponentChildren} children the item's fields
 */

/**
 * The small window for one "When", check, group, or step. "Done" only changes the automation page;
 * nothing is saved until the page's Save.
 * @param {ItemDialogProps} props
 * @returns {import('preact').JSX.Element}
 */
export function ItemDialog({ open, title, onDone, onCancel, onDelete, busy, children }) {
  /** @param {SubmitEvent} event */
  const submit = (event) => {
    event.preventDefault();
    onDone();
  };
  return (
    <Dialog open={open} title={title} onClose={onCancel}>
      <form className={styles.form} onSubmit={submit} noValidate>
        {children}
        <div className={styles.actions}>
          {onDelete && (
            <Button variant="danger" icon="trash" onClick={onDelete}>
              {t('common.delete')}
            </Button>
          )}
          <span className={styles.spacer} />
          <Button onClick={onCancel}>{t('common.cancel')}</Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {t('automations.done')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
