import styles from './EmptyState.module.css';

/**
 * @typedef {object} EmptyStateProps
 * @property {string} title what is missing, as a sentence
 * @property {string} [body] what to do next
 * @property {import('preact').ComponentChildren} [action] usually one primary button
 */

/**
 * Tells the user what to do when there is nothing to show.
 * @param {EmptyStateProps} props
 * @returns {import('preact').JSX.Element}
 */
export function EmptyState({ title, body, action }) {
  return (
    <section className={styles.root}>
      <h2 className={styles.title}>{title}</h2>
      {body && <p className={styles.body}>{body}</p>}
      {action && <div className={styles.action}>{action}</div>}
    </section>
  );
}
