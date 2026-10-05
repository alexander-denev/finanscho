import { useSignal, useSignalEffect } from '@preact/signals';
import { Button } from '../../components/Button.jsx';
import { DateInput } from '../../components/DateInput.jsx';
import { InlineMessage } from '../../components/InlineMessage.jsx';
import { TextField } from '../../components/TextField.jsx';
import { useFormState } from '../../hooks/useFormState.js';
import { t } from '../../i18n/i18n.js';
import { ActionFields } from './ActionFields.jsx';
import { actionDraft, errorsUnder, suggestedName, triggerDraft } from './automationDraft.js';
import { AutomationPreview } from './AutomationPreview.jsx';
import { ConditionGroupFields } from './ConditionGroupFields.jsx';
import { TriggerFields } from './TriggerFields.jsx';
import styles from './AutomationForm.module.css';

/** @typedef {import('./automationDraft.js').AutomationDraft} AutomationDraft */
/** @typedef {import('../../../core/services/AutomationService.js').AutomationPreview} Preview */

/** Quiet time after the last keystroke before the preview is worked out again. */
const PREVIEW_DELAY_MS = 250;

/**
 * @typedef {object} AutomationFormProps
 * @property {AutomationDraft} initial
 * @property {boolean} isEdit shows that changes apply from today on
 * @property {string} today
 * @property {readonly { id: string, name: string, currency: string }[]} accounts
 * @property {readonly { id: string, name: string, kind: string }[]} categories
 * @property {readonly string[]} currencies currencies of the user's accounts
 * @property {{ accountId: string, currency: string }} defaults for new checks and steps
 * @property {(draft: AutomationDraft) => Promise<void>} onSubmit throws ValidationError for inline errors
 * @property {(draft: AutomationDraft) => Promise<Preview>} onPreview rejects while the draft is incomplete
 * @property {() => void} onCancel
 * @property {import('preact').ComponentChildren} [extraActions]
 */

/**
 * Create or change an automation: a name, then "When" (one or more triggers), "If" (checks on the
 * recorded transaction, only with that trigger), and "Do" (one or more steps), the dates it runs
 * between, and a live preview of what it would do.
 * @param {AutomationFormProps} props
 * @returns {import('preact').JSX.Element}
 */
export function AutomationForm({
  initial,
  isEdit,
  today,
  accounts,
  categories,
  currencies,
  defaults,
  onSubmit,
  onPreview,
  onCancel,
  extraActions,
}) {
  const form = useFormState(initial);
  const preview = useSignal(/** @type {Preview | null} */ (null));
  const draft = form.draft.value;
  const errors = form.errors.value;
  /**
   * @param {string} field
   * @returns {string | null}
   */
  const error = (field) => (errors[field] ? t(errors[field]) : null);
  const reacts = draft.triggers.some((trigger) => trigger.type === 'transactionRecorded');
  const allowPercent =
    draft.triggers.length > 0 && draft.triggers.every((x) => x.type === 'transactionRecorded');
  /**
   * @param {string} id
   * @returns {string | undefined}
   */
  const categoryName = (id) => categories.find((c) => c.id === id)?.name;
  /**
   * @param {string} id
   * @returns {string}
   */
  const currencyOf = (id) => accounts.find((a) => a.id === id)?.currency ?? defaults.currency;
  const suggestion = suggestedName(draft, categoryName);

  // Reactive effect: work out the preview again shortly after the draft stops changing.
  useSignalEffect(() => {
    const current = form.draft.value;
    let cancelled = false;
    const timer = setTimeout(() => {
      onPreview(current).then(
        (result) => {
          if (!cancelled) preview.value = result;
        },
        () => {
          if (!cancelled) preview.value = null;
        },
      );
    }, PREVIEW_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  });

  /** @param {SubmitEvent} event */
  const handleSubmit = async (event) => {
    event.preventDefault();
    await form.submit((value) =>
      onSubmit(value.name.trim() ? value : { ...value, name: suggestion }),
    );
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      {isEdit && <InlineMessage>{t('automations.editExplainer')}</InlineMessage>}
      <TextField
        label={t('automations.name')}
        value={draft.name}
        placeholder={suggestion}
        error={error('name')}
        autoComplete="off"
        data-autofocus=""
        onInput={(name) => form.update({ name })}
      />

      <fieldset className={styles.section}>
        <legend className={styles.legend}>{t('automations.when')}</legend>
        <p className={styles.hint}>{t('automations.whenHint')}</p>
        {error('triggers') && (
          <p className={styles.error} role="alert">
            {error('triggers')}
          </p>
        )}
        {draft.triggers.map((trigger, i) => (
          <TriggerFields
            key={trigger.key}
            value={trigger}
            errors={errorsUnder(errors, `triggers.${i}.`)}
            onChange={(patch) =>
              form.update({
                triggers: draft.triggers.map((x, j) => (j === i ? { ...x, ...patch } : x)),
              })
            }
            onRemove={
              draft.triggers.length > 1
                ? () => form.update({ triggers: draft.triggers.filter((_, j) => j !== i) })
                : null
            }
          />
        ))}
        <Button
          icon="plus"
          onClick={() =>
            form.update({ triggers: [...draft.triggers, triggerDraft('schedule', today)] })
          }
        >
          {t('automations.addTrigger')}
        </Button>
      </fieldset>

      {reacts && (
        <fieldset className={styles.section}>
          <legend className={styles.legend}>{t('automations.if')}</legend>
          <p className={styles.hint}>{t('automations.ifHint')}</p>
          <ConditionGroupFields
            value={draft.conditions}
            path="conditions"
            errors={errors}
            onChange={(conditions) =>
              form.update({
                conditions: /** @type {AutomationDraft['conditions']} */ (conditions),
              })
            }
            onRemove={null}
            pickers={{ accounts, categories, currencies }}
            defaults={defaults}
          />
        </fieldset>
      )}

      <fieldset className={styles.section}>
        <legend className={styles.legend}>{t('automations.do')}</legend>
        <p className={styles.hint}>{t('automations.doHint')}</p>
        {error('actions') && (
          <p className={styles.error} role="alert">
            {error('actions')}
          </p>
        )}
        {draft.actions.map((action, i) => (
          <ActionFields
            key={action.key}
            value={action}
            errors={errorsUnder(errors, `actions.${i}.`)}
            onChange={(patch) =>
              form.update({
                actions: draft.actions.map((x, j) => (j === i ? { ...x, ...patch } : x)),
              })
            }
            onRemove={
              draft.actions.length > 1
                ? () => form.update({ actions: draft.actions.filter((_, j) => j !== i) })
                : null
            }
            allowPercent={allowPercent}
            accounts={accounts}
            categories={categories}
          />
        ))}
        <Button
          icon="plus"
          onClick={() =>
            form.update({
              actions: [...draft.actions, actionDraft('createTransaction', defaults)],
            })
          }
        >
          {t('automations.addAction')}
        </Button>
      </fieldset>

      <div className={styles.dates}>
        <DateInput
          label={t('automations.startDate')}
          hint={t('automations.startHint')}
          value={draft.startDate}
          error={error('startDate')}
          required
          onInput={(startDate) => form.update({ startDate })}
        />
        <DateInput
          label={t('common.optional', { label: t('automations.endDate') })}
          value={draft.endDate}
          error={error('endDate')}
          onInput={(endDate) => form.update({ endDate })}
        />
      </div>

      <AutomationPreview
        preview={preview.value}
        currencyOf={currencyOf}
        categoryName={categoryName}
      />

      {Object.keys(errors).length > 0 && (
        <InlineMessage tone="error">{t('errors.validation')}</InlineMessage>
      )}
      {form.formError.value && <InlineMessage tone="error">{form.formError.value}</InlineMessage>}
      <div className={styles.actions}>
        {extraActions}
        <span className={styles.spacer} />
        <Button onClick={onCancel}>{t('common.cancel')}</Button>
        <Button type="submit" variant="primary" disabled={form.busy.value}>
          {form.busy.value ? t('common.saving') : t('automations.save')}
        </Button>
      </div>
    </form>
  );
}
