import { useStores } from '../../context/StoresProvider.jsx';
import { Button } from '../../components/Button.jsx';
import { InlineMessage } from '../../components/InlineMessage.jsx';
import { InstallInstructionsDialog } from '../../components/InstallInstructionsDialog.jsx';
import { useInstallFlow } from '../../hooks/useInstallFlow.js';
import { t } from '../../i18n/i18n.js';
import styles from './InstallBanner.module.css';

/**
 * Recommends installing the app once the user has real data (D38). "Install" uses the browser's
 * own prompt when one is available; otherwise "How to install" opens the instructions. "Not now"
 * snoozes it for two weeks; after three dismissals it stays away (Settings still offers it).
 * @returns {import('preact').JSX.Element | null}
 */
export function InstallBanner() {
  const { install } = useStores();
  const flow = useInstallFlow();

  return (
    <>
      {install.showBanner.value && (
        <div className={styles.root}>
          <InlineMessage>
            <p className={styles.title}>{t('install.banner.title')}</p>
            <p>{t('install.banner.body')}</p>
            {/* Below the text, not in the side action slot, so the text keeps its width on phones. */}
            <div className={styles.actions}>
              {install.canPrompt.value ? (
                <Button variant="primary" onClick={() => void flow.installNow()}>
                  {t('install.install')}
                </Button>
              ) : (
                <Button variant="primary" onClick={flow.openInstructions}>
                  {t('install.howTo')}
                </Button>
              )}
              <Button variant="ghost" onClick={() => void install.dismiss()}>
                {t('install.notNow')}
              </Button>
            </div>
          </InlineMessage>
        </div>
      )}
      <InstallInstructionsDialog {...flow.dialogProps} />
    </>
  );
}
