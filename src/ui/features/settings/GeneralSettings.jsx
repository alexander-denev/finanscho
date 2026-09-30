import { useStores } from '../../context/StoresProvider.jsx';
import { Button } from '../../components/Button.jsx';
import { InlineMessage } from '../../components/InlineMessage.jsx';
import { SegmentedControl } from '../../components/SegmentedControl.jsx';
import { TextField } from '../../components/TextField.jsx';
import { useFormState } from '../../hooks/useFormState.js';
import { t } from '../../i18n/i18n.js';
import { SettingsSection } from './SettingsSection.jsx';
import styles from './GeneralSettings.module.css';

const THEMES = ['system', 'light', 'dark'];

/**
 * Default currency, theme (applied immediately), and device name.
 * @returns {import('preact').JSX.Element}
 */
export function GeneralSettings() {
  const { settings, toasts } = useStores();
  const values = settings.values.value;
  const form = useFormState({
    defaultCurrency: values.defaultCurrency,
    deviceName: values.deviceName,
  });
  const draft = form.draft.value;
  /**
   * @param {string} field
   * @returns {string | null}
   */
  const error = (field) => (form.errors.value[field] ? t(form.errors.value[field]) : null);

  /** @param {SubmitEvent} event */
  const handleSubmit = async (event) => {
    event.preventDefault();
    const ok = await form.submit(async (d) => {
      await settings.setDefaultCurrency(d.defaultCurrency);
      await settings.setDeviceName(d.deviceName);
    });
    if (ok) toasts.show('toast.settingsSaved');
  };

  return (
    <SettingsSection id="settings-general" title={t('settings.general')}>
      <SegmentedControl
        legend={t('settings.theme')}
        value={values.theme}
        options={THEMES.map((theme) => ({ value: theme, label: t(`settings.theme.${theme}`) }))}
        onChange={(theme) => void settings.setTheme(theme)}
      />
      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <TextField
          label={t('settings.defaultCurrency')}
          value={draft.defaultCurrency}
          hint={t('settings.defaultCurrencyHint')}
          error={error('defaultCurrency')}
          maxLength={3}
          autoComplete="off"
          onInput={(value) => form.update({ defaultCurrency: value.toUpperCase() })}
        />
        <TextField
          label={t('settings.deviceName')}
          value={draft.deviceName}
          hint={t('settings.deviceNameHint')}
          error={error('deviceName')}
          autoComplete="off"
          onInput={(deviceName) => form.update({ deviceName })}
        />
        {form.formError.value && <InlineMessage tone="error">{form.formError.value}</InlineMessage>}
        <div className={styles.actions}>
          <Button type="submit" variant="primary" disabled={form.busy.value}>
            {t('settings.saveGeneral')}
          </Button>
        </div>
      </form>
    </SettingsSection>
  );
}
