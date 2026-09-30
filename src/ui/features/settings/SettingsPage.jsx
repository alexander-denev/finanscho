import { PageHeader } from '../../components/PageHeader.jsx';
import { t } from '../../i18n/i18n.js';
import { BackupSettings } from './BackupSettings.jsx';
import { GeneralSettings } from './GeneralSettings.jsx';
import { StorageNotice } from './StorageNotice.jsx';
import { SyncSettings } from './SyncSettings.jsx';

/**
 * Settings: storage notice, general preferences, sync, and backup.
 * @returns {import('preact').JSX.Element}
 */
export function SettingsPage() {
  return (
    <>
      <PageHeader title={t('settings.title')} />
      <StorageNotice />
      <GeneralSettings />
      <SyncSettings />
      <BackupSettings />
    </>
  );
}
