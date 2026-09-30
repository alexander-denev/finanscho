import styles from './Swatch.module.css';

/**
 * @typedef {object} SwatchProps
 * @property {string | null} color swatch key such as 'teal'; null shows a neutral dot
 */

/**
 * A small decorative color dot for accounts and categories.
 * @param {SwatchProps} props
 * @returns {import('preact').JSX.Element}
 */
export function Swatch({ color }) {
  return (
    <span
      className={styles.dot}
      aria-hidden="true"
      style={{ '--swatch': color ? `var(--sw-${color})` : 'var(--c-rule)' }}
    />
  );
}
