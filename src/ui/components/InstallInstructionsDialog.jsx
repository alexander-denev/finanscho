import { t } from '../i18n/i18n.js';
import { Button } from './Button.jsx';
import { Dialog } from './Dialog.jsx';
import { InlineMessage } from './InlineMessage.jsx';
import styles from './InstallInstructionsDialog.module.css';

/** @typedef {import('../../state/InstallStore.js').InstallGuidance} InstallGuidance */

/** Number of numbered steps per guidance (`install.steps.<guidance>.<n>`). */
const STEP_COUNTS = /** @type {const} */ ({
  prompt: 1,
  iosSafari: 3,
  iosOtherBrowser: 3,
  firefoxDesktop: 2,
  manual: 2,
});

/**
 * @typedef {object} InstallInstructionsDialogProps
 * @property {boolean} open
 * @property {InstallGuidance} guidance
 * @property {() => void} onInstall show the browser's install prompt (guidance `prompt`)
 * @property {() => void} onExportBackup
 * @property {string | null} [exportError]
 * @property {() => void} onClose
 */

/**
 * Explains how to install Finanscho in this browser. On iOS the home-screen app has storage
 * separate from Safari, and another browser on the desktop has its own storage too, so both warn
 * and offer a backup export first. Where the installed app shares the browser's storage, it says
 * the data carries over.
 * @param {InstallInstructionsDialogProps} props
 * @returns {import('preact').JSX.Element}
 */
export function InstallInstructionsDialog({
  open,
  guidance,
  onInstall,
  onExportBackup,
  exportError,
  onClose,
}) {
  const steps = Array.from({ length: STEP_COUNTS[guidance] }, (_, i) =>
    t(`install.steps.${guidance}.${i + 1}`),
  );
  const ios = guidance === 'iosSafari' || guidance === 'iosOtherBrowser';
  const otherBrowser = guidance === 'firefoxDesktop';

  return (
    <Dialog open={open} title={t('install.dialog.title')} onClose={onClose}>
      <ol className={styles.steps}>
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      {guidance === 'prompt' && (
        <div className={styles.actions}>
          <Button variant="primary" icon="plus" onClick={onInstall}>
            {t('install.install')}
          </Button>
        </div>
      )}
      {ios || otherBrowser ? (
        <InlineMessage>
          <p className={styles.title}>
            {t(ios ? 'install.ios.warningTitle' : 'install.otherBrowser.warningTitle')}
          </p>
          <p>{t(ios ? 'install.ios.warning' : 'install.otherBrowser.warning')}</p>
          <div className={styles.warningAction}>
            <Button onClick={onExportBackup}>{t('install.exportFirst')}</Button>
          </div>
        </InlineMessage>
      ) : (
        <p className={styles.note}>{t('install.carriesOver')}</p>
      )}
      {exportError && <InlineMessage tone="error">{exportError}</InlineMessage>}
    </Dialog>
  );
}
