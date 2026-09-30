import styles from './Icon.module.css';

/** Stroke paths on a 24 × 24 grid. */
const PATHS = /** @type {const} */ ({
  plus: 'M12 5v14M5 12h14',
  sync: 'M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4',
  chevronLeft: 'M15 6l-6 6 6 6',
  chevronRight: 'M9 6l6 6-6 6',
  close: 'M6 6l12 12M18 6L6 18',
  dashboard: 'M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z',
  list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  budget: 'M12 3v9h9A9 9 0 1 1 12 3zM15 3.5A9 9 0 0 1 20.5 9H15z',
  wallet: 'M3 7h15a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3zM3 7l12-4v4M16 13.5h2',
  repeat: 'M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 0 1-4 4H4',
  tag: 'M3 12V3h9l9 9-9 9zM7.5 7.5h.01',
  settings:
    'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  transfer: 'M4 12h16M14 6l6 6-6 6',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  edit: 'M4 20h4L20 8l-4-4L4 16z',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  cloud: 'M7 18h10a4 4 0 0 0 .5-8 6 6 0 0 0-11.6 1.6A3.3 3.3 0 0 0 7 18z',
  cloudOff: 'M7 18h10a4 4 0 0 0 .5-8 6 6 0 0 0-11.6 1.6A3.3 3.3 0 0 0 7 18zM3 3l18 18',
  alert: 'M12 3l10 18H2zM12 10v5M12 18h.01',
  check: 'M5 12l5 5 9-10',
  cart: 'M3 4h2l2.4 11h11L21 7H6.2M9 20h.01M17 20h.01',
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7z',
  car: 'M5 16h14v-4l-2-5H7l-2 5zM7 16v2M17 16v2M5 12h14',
  utensils: 'M7 2v20M4 2v6a3 3 0 0 0 6 0V2M17 2c-2 2-3 5-3 8h3v12',
  heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  film: 'M4 4h16v16H4zM8 4v16M16 4v16M4 9h4M4 15h4M16 9h4M16 15h4',
  shirt: 'M8 3l4 2 4-2 5 4-3 3-2-1v12H8V9l-2 1-3-3z',
  plane: 'M2 13 22 5l-8 20-2-9z',
  book: 'M4 4h11a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3zM4 17a3 3 0 0 1 3-3h11',
  gift: 'M3 9h18v4H3zM5 13v8h14v-8M12 9v12M12 9C10 5 6 5 6 8s6 1 6 1c2-4 6-4 6-1s-6 1-6 1',
  phone: 'M7 2h10v20H7zM11 18h2',
  briefcase: 'M3 7h18v13H3zM8 7V4h8v3M3 12h18',
  coins:
    'M12 4c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3zM4 7v5c0 1.7 3.6 3 8 3s8-1.3 8-3V7M4 12v5c0 1.7 3.6 3 8 3s8-1.3 8-3v-5',
  arrowIn: 'M12 3v12M7 10l5 5 5-5M4 21h16',
  dots: 'M5 12h.01M12 12h.01M19 12h.01',
});

/** @typedef {keyof typeof PATHS} IconName */

/**
 * @typedef {object} IconProps
 * @property {IconName} name
 * @property {string} [label] accessible name; omit for decorative icons
 */

/**
 * A stroke icon that inherits the current text color. Decorative unless `label` is given.
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
      <path d={PATHS[name] ?? PATHS.dots} />
    </svg>
  );
}
