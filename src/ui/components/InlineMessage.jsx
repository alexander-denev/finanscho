import { Icon } from './Icon.jsx';
import styles from './InlineMessage.module.css';

/**
 * @typedef {object} InlineMessageProps
 * @property {'info' | 'error' | 'success'} [tone]
 * @property {import('preact').ComponentChildren} children
 * @property {import('preact').ComponentChildren} [action]
 */

/**
 * A message inside the page flow. Errors are announced with role="alert".
 * @param {InlineMessageProps} props
 * @returns {import('preact').JSX.Element}
 */
export function InlineMessage({ tone = 'info', children, action }) {
  return (
    <div className={`${styles.root} ${styles[tone]}`} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon name={tone === 'error' ? 'alert' : tone === 'success' ? 'check' : 'cloud'} />
      <div className={styles.text}>{children}</div>
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
