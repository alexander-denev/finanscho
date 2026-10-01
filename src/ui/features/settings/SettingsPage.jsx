import { PageHeader } from '../../components/PageHeader.jsx';
import { t } from '../../i18n/i18n.js';
import { AppStorageSettings } from './AppStorageSettings.jsx';
import { BackupSettings } from './BackupSettings.jsx';
import { GeneralSettings } from './GeneralSettings.jsx';
import { SyncSettings } from './SyncSettings.jsx';

/**
 * Settings: app and storage, general preferences, sync, and backup.
 * @returns {import('preact').JSX.Element}
 */
export function SettingsPage() {
  return (
    <>
      <PageHeader title={t('settings.title')} />
      <AppStorageSettings />
      <GeneralSettings />
      <SyncSettings />
      <BackupSettings />
    </>
  );
}
