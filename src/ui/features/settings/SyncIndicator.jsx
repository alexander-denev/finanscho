import { useStores } from '../../context/StoresProvider.jsx';
import { Icon } from '../../components/Icon.jsx';
import { formatRelativeTime, t } from '../../i18n/i18n.js';
import styles from './SyncIndicator.module.css';

/**
 * Compact sync status: state text plus last successful sync time. Announced politely.
 * @returns {import('preact').JSX.Element}
 */
export function SyncIndicator() {
  const { sync, clock } = useStores();
  const status = sync.syncStatus.value;
  const icon =
    status.state === 'disabled' || status.state === 'offline'
      ? 'cloudOff'
      : status.state === 'error'
        ? 'alert'
        : status.state === 'syncing'
          ? 'sync'
          : 'cloud';
  return (
    <a href="/settings" className={`${styles.root} ${styles[status.state]}`} aria-live="polite">
      <Icon name={icon} />
      <span className={styles.text}>
        <span className={styles.state}>{t(`sync.state.${status.state}`)}</span>
        {status.state !== 'disabled' && (
          <span className={styles.time}>
            {status.lastSyncedAt
              ? t('sync.lastSynced', {
                  time: formatRelativeTime(status.lastSyncedAt, clock.nowMs()),
                })
              : t('sync.never')}
          </span>
        )}
      </span>
    </a>
  );
}
