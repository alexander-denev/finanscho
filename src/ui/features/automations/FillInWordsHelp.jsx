import { useSignal } from '@preact/signals';
import { useId, useRef } from 'preact/hooks';
import { FILL_IN_WORDS } from '../../../core/domain/automation.js';
import { t } from '../../i18n/i18n.js';
import styles from './FillInWordsHelp.module.css';

/**
 * @typedef {object} FillInWordsHelpProps
 * @property {(word: string) => void} onInsert receives the word with its braces, e.g. `{month}`
 */

/**
 * A round "?" button that opens a small box listing the fill-in words for payee and note. It is a
 * tap-to-open disclosure, not a hover tooltip, so it works on phones. Tapping a word adds it at the
 * end of the field; Escape (on the button or a word) closes the box and returns focus to the button.
 * @param {FillInWordsHelpProps} props
 * @returns {import('preact').JSX.Element}
 */
export function FillInWordsHelp({ onInsert }) {
  const open = useSignal(false);
  const panelId = useId();
  const toggle = useRef(/** @type {HTMLButtonElement | null} */ (null));

  /** @param {KeyboardEvent} event */
  const onKeyDown = (event) => {
    if (event.key !== 'Escape' || !open.value) return;
    // Close the box, not the dialog around it.
    event.preventDefault();
    event.stopPropagation();
    open.value = false;
    toggle.current?.focus();
  };

  return (
    <div className={styles.root}>
      <button
        ref={toggle}
        type="button"
        className={styles.toggle}
        onKeyDown={onKeyDown}
        aria-expanded={open.value}
        aria-controls={panelId}
        onClick={() => (open.value = !open.value)}
      >
        <span className={styles.circle} aria-hidden="true">
          ?
        </span>
        {t('automations.words.button')}
      </button>
      {open.value && (
        <div id={panelId} className={styles.panel}>
          <p className={styles.intro}>{t('automations.words.intro')}</p>
          <ul className={styles.list}>
            {FILL_IN_WORDS.map(({ word }) => (
              <li key={word} className={styles.item}>
                <button
                  type="button"
                  className={styles.word}
                  onKeyDown={onKeyDown}
                  onClick={() => onInsert(`{${word}}`)}
                >
                  {`{${word}}`}
                </button>
                <span className={styles.meaning}>{t(`automations.word.${word}`)}</span>
              </li>
            ))}
          </ul>
          <p className={styles.note}>{t('automations.words.sourceOnly')}</p>
        </div>
      )}
    </div>
  );
}
