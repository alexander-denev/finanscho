import { useEffect, useId, useRef } from 'preact/hooks';
import { t } from '../i18n/i18n.js';
import { Button } from './Button.jsx';
import styles from './Dialog.module.css';

/**
 * @typedef {object} DialogProps
 * @property {boolean} open
 * @property {string} title
 * @property {() => void} onClose called on Escape or the close button
 * @property {import('preact').ComponentChildren} children rendered only while open
 */

/**
 * Modal dialog built on the native `<dialog>` element with `showModal()`. On open, focus moves to
 * the first descendant marked `data-autofocus` (else the browser default); on close, focus returns
 * to the element that was focused before opening.
 * @param {DialogProps} props
 * @returns {import('preact').JSX.Element}
 */
export function Dialog({ open, title, onClose, children }) {
  const ref = useRef(/** @type {HTMLDialogElement | null} */ (null));
  const returnFocus = useRef(/** @type {HTMLElement | null} */ (null));
  const titleId = useId();

  // DOM integration: sync the `open` prop with the native modal state.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      returnFocus.current = /** @type {HTMLElement | null} */ (document.activeElement);
      dialog.showModal();
      /** @type {HTMLElement | null} */ (dialog.querySelector('[data-autofocus]'))?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const handleClose = () => {
    returnFocus.current?.focus();
    returnFocus.current = null;
    if (open) onClose();
  };

  return (
    <dialog ref={ref} className={styles.dialog} aria-labelledby={titleId} onClose={handleClose}>
      {open && (
        <div className={styles.panel}>
          <header className={styles.header}>
            <h2 id={titleId} className={styles.title}>
              {title}
            </h2>
            <Button
              variant="ghost"
              icon="close"
              aria-label={t('common.close')}
              onClick={() => ref.current?.close()}
            />
          </header>
          <div className={styles.body}>{children}</div>
        </div>
      )}
    </dialog>
  );
}
