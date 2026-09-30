import { formatDate } from '../i18n/i18n.js';
import { Amount } from './Amount.jsx';
import styles from './UpcomingList.module.css';

/**
 * @typedef {object} UpcomingItem
 * @property {string} key
 * @property {string} date 'YYYY-MM-DD'
 * @property {string} title
 * @property {string} [subtitle]
 * @property {number} minor
 * @property {string} currency
 * @property {'income' | 'expense' | 'transfer'} kind
 */

/**
 * @typedef {object} UpcomingListProps
 * @property {readonly UpcomingItem[]} items
 * @property {string} emptyText
 */

/**
 * Scheduled items by date, with amounts right-aligned.
 * @param {UpcomingListProps} props
 * @returns {import('preact').JSX.Element}
 */
export function UpcomingList({ items, emptyText }) {
  if (items.length === 0) return <p className={styles.empty}>{emptyText}</p>;
  return (
    <ul className={styles.list}>
      {items.map((item) => (
        <li key={item.key} className={styles.row}>
          <time className={styles.date} dateTime={item.date}>
            {formatDate(item.date, 'short')}
          </time>
          <span className={styles.text}>
            <span className={styles.title}>{item.title}</span>
            {item.subtitle && <span className={styles.subtitle}>{item.subtitle}</span>}
          </span>
          <Amount minor={item.minor} currency={item.currency} kind={item.kind} />
        </li>
      ))}
    </ul>
  );
}
