import { useSignal } from '@preact/signals';
import { useId } from 'preact/hooks';
import { useStores } from '../../context/StoresProvider.jsx';
import { Button } from '../../components/Button.jsx';
import { InlineMessage } from '../../components/InlineMessage.jsx';
import { errorMessage, t } from '../../i18n/i18n.js';
import { SettingsSection } from './SettingsSection.jsx';
import styles from './BackupSettings.module.css';

/**
 * Offers a text file to the user as a download.
 * @param {string} fileName
 * @param {string} text
 * @returns {void}
 */
function downloadText(fileName, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * JSON export and import of the whole local database.
 * @returns {import('preact').JSX.Element}
 */
export function BackupSettings() {
  const { settings, toasts } = useStores();
  const error = useSignal(/** @type {string | null} */ (null));
  const busy = useSignal(false);
  const fileInputId = useId();

  const exportBackup = async () => {
    error.value = null;
    try {
      const { fileName, json } = await settings.exportBackup();
      downloadText(fileName, json);
      toasts.show('toast.exported', { file: fileName });
    } catch (failure) {
      error.value = errorMessage(failure);
    }
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
      {error.value && <InlineMessage tone="error">{error.value}</InlineMessage>}
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
