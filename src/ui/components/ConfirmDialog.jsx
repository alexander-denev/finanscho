import { t } from '../i18n/i18n.js';
import { Button } from './Button.jsx';
import { Dialog } from './Dialog.jsx';
import styles from './ConfirmDialog.module.css';

/**
 * @typedef {object} ConfirmDialogProps
 * @property {boolean} open
 * @property {string} title
 * @property {string} message
 * @property {string} confirmLabel says what happens, e.g. "Delete transaction"
 * @property {() => void} onConfirm
 * @property {() => void} onCancel
 * @property {boolean} [danger]
 */

/**
 * Asks the user to confirm a consequential action.
 * @param {ConfirmDialogProps} props
 * @returns {import('preact').JSX.Element}
 */
export function ConfirmDialog({ open, title, message, confirmLabel, onConfirm, onCancel, danger }) {
  return (
    <Dialog open={open} title={title} onClose={onCancel}>
      <p className={styles.message}>{message}</p>
      <div className={styles.actions}>
        <Button onClick={onCancel}>{t('common.cancel')}</Button>
        <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
