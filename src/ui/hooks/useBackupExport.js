import { useSignal } from '@preact/signals';
import { useStores } from '../context/StoresProvider.jsx';
import { errorMessage } from '../i18n/i18n.js';

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
 * The "Export backup" action: downloads the whole local database as JSON and confirms with a
 * toast. Shared by Backup settings and the install instructions (export before moving to the
 * installed app on iOS).
 * @returns {{ exportBackup: () => Promise<boolean>, error: import('@preact/signals').ReadonlySignal<string | null> }}
 */
export function useBackupExport() {
  const { settings, toasts } = useStores();
  const error = useSignal(/** @type {string | null} */ (null));

  const exportBackup = async () => {
    error.value = null;
    try {
      const { fileName, json } = await settings.exportBackup();
      downloadText(fileName, json);
      toasts.show('toast.exported', { file: fileName });
      return true;
    } catch (failure) {
      error.value = errorMessage(failure);
      return false;
    }
  };

  return { exportBackup, error };
}
