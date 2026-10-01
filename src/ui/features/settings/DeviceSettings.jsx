import { useSignal } from '@preact/signals';
import { useStores } from '../../context/StoresProvider.jsx';
import { Button } from '../../components/Button.jsx';
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx';
import { InlineMessage } from '../../components/InlineMessage.jsx';
import { errorMessage, formatRelativeTime, t } from '../../i18n/i18n.js';
import { SettingsSection } from './SettingsSection.jsx';
import styles from './DeviceSettings.module.css';

/** @typedef {import('../../../core/ports/syncTransport.js').DeviceInfo} DeviceInfo */

const DAY_MS = 86_400_000;
/** A device unseen this long is marked inactive. */
export const INACTIVE_AFTER_MS = 90 * DAY_MS;
/** Removing a device seen this recently gets an extra warning: it is probably still in use. */
export const RECENT_WITHIN_MS = 7 * DAY_MS;

/**
 * @param {DeviceInfo} device
 * @returns {string}
 */
function nameOf(device) {
  return device.deviceName || t('settings.devices.unnamed');
}

/**
 * The devices syncing with this vault, with "Remove" (confirmed, D41) and "Clean up server data".
 * Shown only while sync is configured.
 * @returns {import('preact').JSX.Element | null}
 */
export function DeviceSettings() {
  const { sync, toasts, clock } = useStores();
  const confirming = useSignal(/** @type {DeviceInfo | null} */ (null));
  const error = useSignal(/** @type {string | null} */ (null));
  const busy = useSignal(false);
  if (sync.config.value === null) return null;

  const status = sync.syncStatus.value;
  const now = clock.nowMs();
  const ageOf = (/** @type {DeviceInfo} */ d) =>
    d.lastSeenAt ? now - Date.parse(d.lastSeenAt) : Number.POSITIVE_INFINITY;
  const target = confirming.value;

  const remove = async () => {
    const device = confirming.value;
    confirming.value = null;
    if (!device) return;
    error.value = null;
    busy.value = true;
    try {
      await sync.removeDevice(device.deviceId);
      toasts.show('toast.deviceRemoved', { name: nameOf(device) });
    } catch (failure) {
      error.value = errorMessage(failure);
    } finally {
      busy.value = false;
    }
  };

  const cleanUp = async () => {
    error.value = null;
    busy.value = true;
    await sync.compactNow();
    busy.value = false;
    const after = sync.syncStatus.value;
    if (after.state === 'idle' && !after.cleanupBlocked) toasts.show('toast.cleanedUp');
  };

  return (
    <SettingsSection
      id="settings-devices"
      title={t('settings.devices.title')}
      intro={t('settings.devices.intro')}
    >
      <ul className={styles.list}>
        {sync.devices.value.map((device) => (
          <li key={device.deviceId} className={styles.item}>
            <div className={styles.details}>
              <p className={styles.name}>
                {nameOf(device)}
                {device.isSelf && (
                  <span className={styles.badge}>{t('settings.devices.thisDevice')}</span>
                )}
                {!device.isSelf && ageOf(device) >= INACTIVE_AFTER_MS && (
                  <span className={styles.badge}>{t('settings.devices.inactive')}</span>
                )}
              </p>
              <p className={styles.meta}>
                {device.lastSeenAt
                  ? t('settings.devices.lastSeen', {
                      time: formatRelativeTime(device.lastSeenAt, now),
                    })
                  : t('settings.devices.neverSeen')}
              </p>
              {!device.isSelf && !device.fullySynced && (
                <p className={styles.meta}>{t('settings.devices.behind')}</p>
              )}
            </div>
            {!device.isSelf && (
              <Button
                variant="ghost"
                aria-label={`${t('settings.devices.remove')} ${nameOf(device)}`}
                disabled={busy.value}
                onClick={() => {
                  confirming.value = device;
                }}
              >
                {t('settings.devices.remove')}
              </Button>
            )}
          </li>
        ))}
      </ul>
      {error.value && <InlineMessage tone="error">{error.value}</InlineMessage>}
      {status.cleanupBlocked && (
        <InlineMessage tone="error">{t('settings.devices.cleanupBlocked')}</InlineMessage>
      )}
      <div className={styles.actions}>
        <Button onClick={() => void cleanUp()} disabled={busy.value || status.state === 'syncing'}>
          {busy.value ? t('settings.devices.cleaning') : t('settings.devices.cleanUp')}
        </Button>
      </div>
      <p className={styles.help}>{t('settings.devices.cleanUpHelp')}</p>
      <ConfirmDialog
        open={target !== null}
        title={t('settings.devices.removeTitle', { name: target ? nameOf(target) : '' })}
        message={
          target && ageOf(target) < RECENT_WITHIN_MS
            ? `${t('settings.devices.removeBody')} ${t('settings.devices.removeRecent')}`
            : t('settings.devices.removeBody')
        }
        confirmLabel={t('settings.devices.removeConfirm')}
        danger
        onConfirm={() => void remove()}
        onCancel={() => {
          confirming.value = null;
        }}
      />
    </SettingsSection>
  );
}
