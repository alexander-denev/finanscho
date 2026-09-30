import { useStores } from '../../context/StoresProvider.jsx';
import { Button } from '../../components/Button.jsx';
import { InlineMessage } from '../../components/InlineMessage.jsx';
import { t } from '../../i18n/i18n.js';
import styles from './StorageNotice.module.css';

/**
 * One-time recommendation to enable sync or export backups, because the OS may evict local
 * storage (especially on iOS).
 * @returns {import('preact').JSX.Element | null}
 */
export function StorageNotice() {
  const { settings } = useStores();
  if (settings.values.value.storageNoticeDismissed) return null;
  return (
    <InlineMessage
      action={
        <Button variant="ghost" onClick={() => void settings.dismissStorageNotice()}>
          {t('settings.storageNotice.dismiss')}
        </Button>
      }
    >
      <p className={styles.title}>{t('settings.storageNotice.title')}</p>
      <p>{t('settings.storageNotice.body')}</p>
      {settings.storagePersisted.value === true && <p>{t('settings.storageNotice.persisted')}</p>}
    </InlineMessage>
  );
}
