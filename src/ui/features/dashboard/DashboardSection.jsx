import styles from './DashboardSection.module.css';

/**
 * @typedef {object} DashboardSectionProps
 * @property {string} id used for the heading id
 * @property {string} title
 * @property {{ href: string, label: string }} [link]
 * @property {import('preact').ComponentChildren} children
 */

/**
 * A titled dashboard section with an optional link to the full page.
 * @param {DashboardSectionProps} props
 * @returns {import('preact').JSX.Element}
 */
export function DashboardSection({ id, title, link, children }) {
  return (
    <section className={styles.section} aria-labelledby={id}>
      <header className={styles.header}>
        <h2 id={id} className={styles.title}>
          {title}
        </h2>
        {link && (
          <a className={styles.link} href={link.href}>
            {link.label}
          </a>
        )}
      </header>
      {children}
    </section>
  );
}
