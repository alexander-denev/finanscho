import { useSignal } from '@preact/signals';
import { useStores } from '../context/StoresProvider.jsx';
import { useBackupExport } from './useBackupExport.js';

/**
 * Shared install actions for the install banner and the App and storage settings: "Install"
 * (the browser's prompt, falling back to the instructions if it vanished), and the props for
 * `InstallInstructionsDialog`, including its "Export backup first" action.
 * @returns {{
 *   installNow: () => Promise<void>,
 *   openInstructions: () => void,
 *   dialogProps: import('../components/InstallInstructionsDialog.jsx').InstallInstructionsDialogProps,
 * }}
 */
export function useInstallFlow() {
  const { install, toasts } = useStores();
  const exporter = useBackupExport();
  const open = useSignal(false);

  const installNow = async () => {
    const outcome = await install.install();
    if (outcome === 'accepted') {
      toasts.show('toast.installed');
      open.value = false;
    }
    // The prompt can disappear between render and click; show the instructions instead.
    if (outcome === 'unavailable') open.value = true;
  };

  return {
    installNow,
    openInstructions: () => {
      open.value = true;
    },
    dialogProps: {
      open: open.value,
      guidance: install.guidance.value,
      onInstall: () => void installNow(),
      onExportBackup: () => void exporter.exportBackup(),
      exportError: exporter.error.value,
      onClose: () => {
        open.value = false;
      },
    },
  };
}
