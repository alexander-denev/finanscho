import { ITEM_ICON_PATHS } from '../icons/itemIconPaths.js';
import styles from './Icon.module.css';

/** The app's own stroke paths on a 24 × 24 grid; account and category icons are in `ITEM_ICON_PATHS`. */
const PATHS = /** @type {const} */ ({
  plus: 'M12 5v14M5 12h14',
  sync: 'M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4',
  chevronLeft: 'M15 6l-6 6 6 6',
  chevronRight: 'M9 6l6 6-6 6',
  chevronDown: 'M6 9l6 6 6-6',
  close: 'M6 6l12 12M18 6L6 18',
  dashboard: 'M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z',
  list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  budget: 'M12 3v9h9A9 9 0 1 1 12 3zM15 3.5A9 9 0 0 1 20.5 9H15z',
  repeat: 'M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 0 1-4 4H4',
  settings:
    'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1',
  // Dots drawn as small circles: zero-length segments render as near-invisible 1.8 px specks.
  more: 'M5 10.8a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 1 0 0-2.4zM12 10.8a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 1 0 0-2.4zM19 10.8a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 1 0 0-2.4z',
  transfer: 'M4 12h16M14 6l6 6-6 6',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  edit: 'M4 20h4L20 8l-4-4L4 16z',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  cloud: 'M7 18h10a4 4 0 0 0 .5-8 6 6 0 0 0-11.6 1.6A3.3 3.3 0 0 0 7 18z',
  cloudOff: 'M7 18h10a4 4 0 0 0 .5-8 6 6 0 0 0-11.6 1.6A3.3 3.3 0 0 0 7 18zM3 3l18 18',
  alert: 'M12 3l10 18H2zM12 10v5M12 18h.01',
  check: 'M5 12l5 5 9-10',
});

/** @typedef {keyof typeof PATHS | import('../../core/domain/itemIcons.js').ItemIcon} IconName */

/**
 * @param {string} name
 * @returns {string}
 */
function iconPath(name) {
  return (
    /** @type {Record<string, string>} */ (PATHS)[name] ??
    /** @type {Record<string, string>} */ (ITEM_ICON_PATHS)[name] ??
    ITEM_ICON_PATHS.dots
  );
}

/**
 * @typedef {object} IconProps
 * @property {IconName} name
 * @property {string} [label] accessible name; omit for decorative icons
 */

/**
 * A stroke icon that inherits the current text color. Decorative unless `label` is given. An
 * unknown name (an icon from a newer app version) draws the "other" dots.
 * @param {IconProps} props
 * @returns {import('preact').JSX.Element}
 */
export function Icon({ name, label }) {
  return (
    <svg
      className={styles.icon}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : 'true'}
    >
      <path d={iconPath(name)} />
    </svg>
  );
}
