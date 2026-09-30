import styles from './SettingsSection.module.css';

/**
 * @typedef {object} SettingsSectionProps
 * @property {string} id heading id
 * @property {string} title
 * @property {string} [intro]
 * @property {import('preact').ComponentChildren} children
 */

/**
 * A titled block on the settings page.
 * @param {SettingsSectionProps} props
 * @returns {import('preact').JSX.Element}
 */
export function SettingsSection({ id, title, intro, children }) {
  return (
    <section className={styles.section} aria-labelledby={id}>
      <h2 id={id} className={styles.title}>
        {title}
      </h2>
      {intro && <p className={styles.intro}>{intro}</p>}
      {children}
    </section>
  );
}
