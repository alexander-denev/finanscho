import { t } from '../i18n/i18n.js';
import { Button } from './Button.jsx';
import styles from './Toast.module.css';

/** @typedef {{ id: number, message: string, tone: 'info' | 'error' }} ToastItem */

/**
 * @typedef {object} ToastProps
 * @property {readonly ToastItem[]} toasts
 * @property {(id: number) => void} onDismiss
 */

/**
 * A live region that announces short confirmations and errors.
 * @param {ToastProps} props
 * @returns {import('preact').JSX.Element}
 */
export function Toast({ toasts, onDismiss }) {
  return (
    <div className={styles.region} role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`${styles.toast} ${styles[toast.tone]}`}>
          <span className={styles.message}>{toast.message}</span>
          <Button
            variant="ghost"
            icon="close"
            aria-label={t('common.dismiss')}
            onClick={() => onDismiss(toast.id)}
          />
        </div>
      ))}
    </div>
  );
}
