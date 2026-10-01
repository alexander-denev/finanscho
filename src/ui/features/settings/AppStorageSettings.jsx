import { useSignal } from '@preact/signals';
import { useStores } from '../../context/StoresProvider.jsx';
import { Button } from '../../components/Button.jsx';
import { InlineMessage } from '../../components/InlineMessage.jsx';
import { InstallInstructionsDialog } from '../../components/InstallInstructionsDialog.jsx';
import { useInstallFlow } from '../../hooks/useInstallFlow.js';
import { formatBytes, t } from '../../i18n/i18n.js';
import { SettingsSection } from './SettingsSection.jsx';
import styles from './AppStorageSettings.module.css';

/**
 * How Finanscho runs on this device: installed or not (with Install or instructions), whether
 * storage is protected from eviction ("Protect my data" asks the browser, from a user gesture as
 * Firefox requires), space used, and backup/sync advice when storage is not guaranteed.
 * @returns {import('preact').JSX.Element}
 */
export function AppStorageSettings() {
  const { install } = useStores();
  const flow = useInstallFlow();
  const denied = useSignal(false);
  const installed = install.installed.value;
  const persisted = install.persisted.value;
  const usage = install.usage.value;
  const quota = install.quota.value;

  const protect = async () => {
    await install.requestPersistence();
    denied.value = install.persisted.value !== true;
  };

  return (
    <SettingsSection
      id="settings-app-storage"
      title={t('settings.appStorage.title')}
      intro={t('settings.appStorage.intro')}
    >
      {install.showFreshInstallHint.value && (
        <InlineMessage>
          <p className={styles.title}>{t('install.freshHint.title')}</p>
          <p>{t('install.freshHint.body')}</p>
        </InlineMessage>
      )}
      <dl className={styles.facts}>
        <div className={styles.fact}>
          <dt>{t('settings.appStorage.app')}</dt>
          <dd>
            {t(installed ? 'settings.appStorage.installed' : 'settings.appStorage.notInstalled')}
          </dd>
        </div>
        <div className={styles.fact}>
          <dt>{t('settings.appStorage.storage')}</dt>
          <dd>
            {t(
              persisted === true
                ? 'settings.appStorage.protected'
                : 'settings.appStorage.notGuaranteed',
            )}
          </dd>
        </div>
        {usage !== null && quota !== null && (
          <div className={styles.fact}>
            <dt>{t('settings.appStorage.used')}</dt>
            <dd>
              {t('settings.appStorage.usage', {
                used: formatBytes(usage),
                quota: formatBytes(quota),
              })}
            </dd>
          </div>
        )}
      </dl>
      {(!installed || persisted === false) && (
        <div className={styles.actions}>
          {!installed &&
            (install.canPrompt.value ? (
              <Button variant="primary" onClick={() => void flow.installNow()}>
                {t('install.install')}
              </Button>
            ) : (
              <Button onClick={flow.openInstructions}>{t('install.howTo')}</Button>
            ))}
          {persisted === false && (
            <Button onClick={() => void protect()}>{t('settings.appStorage.protect')}</Button>
          )}
        </div>
      )}
      {denied.value && persisted !== true && (
        <InlineMessage tone="error">{t('settings.appStorage.protectDenied')}</InlineMessage>
      )}
      <p className={styles.help}>
        {t(
          persisted === true ? 'settings.appStorage.persistedAdvice' : 'settings.appStorage.advice',
        )}
      </p>
      <InstallInstructionsDialog {...flow.dialogProps} />
    </SettingsSection>
  );
}
