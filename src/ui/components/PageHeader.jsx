import styles from './PageHeader.module.css';

/**
 * @typedef {object} PageHeaderProps
 * @property {string} title
 * @property {import('preact').ComponentChildren} [actions]
 */

/**
 * Page title (the page's single h1) with optional actions on the right.
 * @param {PageHeaderProps} props
 * @returns {import('preact').JSX.Element}
 */
export function PageHeader({ title, actions }) {
  return (
    <header className={styles.root}>
      <h1 className={styles.title}>{title}</h1>
      {actions && <div className={styles.actions}>{actions}</div>}
    </header>
  );
}
