import { itemColor } from '../styles/itemColor.js';
import { Icon } from './Icon.jsx';
import styles from './ItemIcon.module.css';

/**
 * @typedef {object} ItemIconProps
 * @property {import('./Icon.jsx').IconName} icon
 * @property {string | null} [color] swatch name or custom `#rrggbb`; none shows gray
 * @property {'sm' | 'md'} [size]
 */

/**
 * An account or category icon on a soft circle tinted with its color. Decorative: the name is
 * always written next to it.
 * @param {ItemIconProps} props
 * @returns {import('preact').JSX.Element}
 */
export function ItemIcon({ icon, color = null, size = 'md' }) {
  return (
    <span
      className={`${styles.root} ${styles[size]}`}
      aria-hidden="true"
      style={{ '--item-color': itemColor(color) }}
    >
      <Icon name={icon} />
    </span>
  );
}
