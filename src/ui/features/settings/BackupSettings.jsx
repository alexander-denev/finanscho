import { useSignal } from '@preact/signals';
import { useId } from 'preact/hooks';
import { useStores } from '../../context/StoresProvider.jsx';
import { Button } from '../../components/Button.jsx';
import { InlineMessage } from '../../components/InlineMessage.jsx';
import { useBackupExport } from '../../hooks/useBackupExport.js';
import { errorMessage, t } from '../../i18n/i18n.js';
import { SettingsSection } from './SettingsSection.jsx';
import styles from './BackupSettings.module.css';

/**
 * JSON export and import of the whole local database.
 * @returns {import('preact').JSX.Element}
 */
export function BackupSettings() {
  const { settings, toasts } = useStores();
  const exporter = useBackupExport();
  const error = useSignal(/** @type {string | null} */ (null));
  const busy = useSignal(false);
  const fileInputId = useId();
  const shownError = error.value ?? exporter.error.value;

  const exportBackup = async () => {
    error.value = null;
    await exporter.exportBackup();
  };

  /** @param {Event} event */
  const importBackup = async (event) => {
    const input = /** @type {HTMLInputElement} */ (event.currentTarget);
    const file = input.files?.[0];
    if (!file) return;
    error.value = null;
    busy.value = true;
    try {
      const count = await settings.importBackup(await file.text());
      toasts.show('toast.imported', { count });
    } catch (failure) {
      error.value = errorMessage(failure);
    } finally {
      busy.value = false;
      input.value = '';
    }
  };

  return (
    <SettingsSection
      id="settings-backup"
      title={t('settings.backup')}
      intro={t('settings.backupIntro')}
    >
      {shownError && <InlineMessage tone="error">{shownError}</InlineMessage>}
      <div className={styles.actions}>
        <Button variant="primary" onClick={() => void exportBackup()}>
          {t('settings.export')}
        </Button>
      </div>
      <div className={styles.fileField}>
        <label htmlFor={fileInputId} className={styles.fileLabel}>
          {t('settings.importFile')}
        </label>
        <input
          id={fileInputId}
          className={styles.fileInput}
          type="file"
          accept="application/json,.json"
          disabled={busy.value}
          onChange={(event) => void importBackup(event)}
        />
      </div>
    </SettingsSection>
  );
}
