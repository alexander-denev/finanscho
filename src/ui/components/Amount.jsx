import { formatMoney, t } from '../i18n/i18n.js';
import styles from './Amount.module.css';

/**
 * How to present an amount:
 * - `income` / `expense` / `transfer`: a positive stored amount, signed by its kind;
 * - `signed`: a signed value (balances, nets), negative shown with a minus;
 * - `plain`: no sign.
 * @typedef {'income' | 'expense' | 'transfer' | 'signed' | 'plain'} AmountKind
 */

/**
 * @typedef {object} AmountProps
 * @property {number} minor
 * @property {string} currency
 * @property {AmountKind} [kind]
 * @property {'md' | 'lg' | 'xl'} [size]
 */

/**
 * A money amount in tabular figures. Direction is shown with a sign and a visually hidden label,
 * not by color alone.
 * @param {AmountProps} props
 * @returns {import('preact').JSX.Element}
 */
export function Amount({ minor, currency, kind = 'plain', size = 'md' }) {
  /** @type {string} */
  let text;
  /** @type {string | null} */
  let label = null;
  let tone = styles.neutral;
  if (kind === 'income') {
    text = formatMoney(minor, currency, { signDisplay: 'always' });
    label = t('amount.income');
    tone = styles.positive;
  } else if (kind === 'expense') {
    text = formatMoney(-minor, currency);
    label = t('amount.expense');
  } else if (kind === 'transfer') {
    text = formatMoney(minor, currency);
    label = t('amount.transfer');
    tone = styles.muted;
  } else if (kind === 'signed') {
    text = formatMoney(minor, currency, { signDisplay: 'exceptZero' });
    if (minor > 0) {
      label = t('amount.positive');
      tone = styles.positive;
    } else if (minor < 0) {
      label = t('amount.negative');
      tone = styles.negative;
    }
  } else {
    text = formatMoney(minor, currency);
  }
  return (
    <span className={`${styles.amount} ${styles[size]} ${tone}`}>
      {label && <span className="visually-hidden">{label} </span>}
      {kind === 'transfer' && (
        <span aria-hidden="true" className={styles.glyph}>
          ⇄{' '}
        </span>
      )}
      {text}
    </span>
  );
}
