import { useSignal } from '@preact/signals';
import { useStores } from '../../context/StoresProvider.jsx';
import { Button } from '../../components/Button.jsx';
import { InlineMessage } from '../../components/InlineMessage.jsx';
import { TextField } from '../../components/TextField.jsx';
import { useFormState } from '../../hooks/useFormState.js';
import { formatRelativeTime, t } from '../../i18n/i18n.js';
import { SettingsSection } from './SettingsSection.jsx';
import styles from './SyncSettings.module.css';

/** @typedef {import('../../../core/ports/credentialStore.js').WebDavCredentials} WebDavCredentials */

/**
 * WebDAV sync setup: status, connection form, test, save, sync now, and turn off.
 * @returns {import('preact').JSX.Element}
 */
export function SyncSettings() {
  const { sync, toasts, clock } = useStores();
  const status = sync.syncStatus.value;
  const configured = sync.config.value !== null;
  const form = useFormState(
    /** @type {WebDavCredentials} */ (
      sync.config.value ?? { url: '', vaultPath: 'finanscho', username: '', password: '' }
    ),
  );
  const draft = form.draft.value;
  const testResult = useSignal(/** @type {{ ok: boolean, message: string } | null} */ (null));
  const testing = useSignal(false);

  const test = async () => {
    testing.value = true;
    testResult.value = null;
    const result = await sync.testConnection(form.draft.value);
    testing.value = false;
    testResult.value = result.ok
      ? { ok: true, message: t('settings.testOk') }
      : { ok: false, message: t(`errors.sync.${result.reason}`) };
  };

  /** @param {SubmitEvent} event */
  const handleSubmit = async (event) => {
    event.preventDefault();
    testResult.value = null;
    const ok = await form.submit(async (credentials) => {
      await sync.configure({
        ...credentials,
        url: credentials.url.trim(),
        vaultPath: credentials.vaultPath.trim() || 'finanscho',
      });
    });
    if (ok) toasts.show('toast.syncSaved');
  };

  const disconnect = async () => {
    await sync.configure(null);
    form.update({ password: '' });
    toasts.show('toast.syncDisconnected');
  };

  const canSubmit = draft.url.trim() !== '' && draft.username.trim() !== '';

  return (
    <SettingsSection id="settings-sync" title={t('settings.sync')} intro={t('settings.syncIntro')}>
      <dl className={styles.status}>
        <dt>{t('settings.syncStatus')}</dt>
        <dd aria-live="polite">
          {t(`sync.state.${status.state}`)}
          {status.lastSyncedAt &&
            ` — ${t('sync.lastSynced', { time: formatRelativeTime(status.lastSyncedAt, clock.nowMs()) })}`}
        </dd>
      </dl>
      {status.reason && (
        <InlineMessage tone="error">{t(`errors.sync.${status.reason}`)}</InlineMessage>
      )}
      {status.issues > 0 && <InlineMessage tone="error">{t('sync.issues')}</InlineMessage>}
      {status.deferredOps > 0 && <InlineMessage>{t('sync.deferred')}</InlineMessage>}
      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <TextField
          label={t('settings.serverUrl')}
          type="url"
          inputMode="url"
          value={draft.url}
          hint={t('settings.serverUrlHint')}
          autoComplete="url"
          spellcheck={false}
          onInput={(url) => form.update({ url })}
        />
        <TextField
          label={t('settings.vaultPath')}
          value={draft.vaultPath}
          hint={t('settings.vaultPathHint')}
          autoComplete="off"
          spellcheck={false}
          onInput={(vaultPath) => form.update({ vaultPath })}
        />
        <TextField
          label={t('settings.username')}
          value={draft.username}
          autoComplete="username"
          spellcheck={false}
          onInput={(username) => form.update({ username })}
        />
        <TextField
          label={t('settings.password')}
          type="password"
          value={draft.password}
          hint={t('settings.passwordHint')}
          autoComplete="current-password"
          onInput={(password) => form.update({ password })}
        />
        <p className={styles.help}>{t('settings.syncCors')}</p>
        {testResult.value && (
          <InlineMessage tone={testResult.value.ok ? 'success' : 'error'}>
            {testResult.value.message}
          </InlineMessage>
        )}
        {form.formError.value && <InlineMessage tone="error">{form.formError.value}</InlineMessage>}
        <div className={styles.actions}>
          <Button onClick={() => void test()} disabled={!canSubmit || testing.value}>
            {testing.value ? t('settings.testing') : t('settings.testConnection')}
          </Button>
          <Button type="submit" variant="primary" disabled={!canSubmit || form.busy.value}>
            {t('settings.saveSync')}
          </Button>
          {configured && (
            <>
              <Button
                icon="sync"
                onClick={() => void sync.syncNow()}
                disabled={status.state === 'syncing'}
              >
                {t('settings.syncNow')}
              </Button>
              <Button variant="danger" onClick={() => void disconnect()}>
                {t('settings.disconnect')}
              </Button>
            </>
          )}
        </div>
      </form>
    </SettingsSection>
  );
}
