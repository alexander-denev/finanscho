import { Amount } from './Amount.jsx';
import { Swatch } from './Swatch.jsx';
import styles from './BalanceList.module.css';

/**
 * @typedef {object} BalanceItem
 * @property {string} id
 * @property {string} name
 * @property {string} [subtitle]
 * @property {string | null} color
 * @property {number} minor
 * @property {string} currency
 */

/**
 * @typedef {object} BalanceListProps
 * @property {readonly BalanceItem[]} items
 * @property {(id: string) => void} [onSelect] makes rows buttons
 * @property {string} [label] accessible name of the list
 */

/**
 * Names on the left, signed balances right-aligned in tabular figures.
 * @param {BalanceListProps} props
 * @returns {import('preact').JSX.Element}
 */
export function BalanceList({ items, onSelect, label }) {
  return (
    <ul className={styles.list} aria-label={label}>
      {items.map((item) => {
        const content = (
          <>
            <Swatch color={item.color} />
            <span className={styles.text}>
              <span className={styles.name}>{item.name}</span>
              {item.subtitle && <span className={styles.subtitle}>{item.subtitle}</span>}
            </span>
            <Amount minor={item.minor} currency={item.currency} kind="signed" size="lg" />
          </>
        );
        return (
          <li key={item.id}>
            {onSelect ? (
              <button
                type="button"
                className={`${styles.row} ${styles.button}`}
                onClick={() => onSelect(item.id)}
              >
                {content}
              </button>
            ) : (
              <div className={styles.row}>{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
