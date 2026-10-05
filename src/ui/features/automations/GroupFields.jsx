import { useSignal } from '@preact/signals';
import { CONDITION_FIELDS, MATCH_MODES } from '../../../core/domain/automation.js';
import { Button } from '../../components/Button.jsx';
import { Select } from '../../components/Select.jsx';
import { t } from '../../i18n/i18n.js';
import { conditionDraft, errorsUnder } from './automationDraft.js';
import { ConditionFields } from './ConditionFields.jsx';
import styles from './GroupFields.module.css';

/** @typedef {import('./automationDraft.js').GroupDraft} GroupDraft */

/**
 * @typedef {object} GroupFieldsProps
 * @property {GroupDraft} value
 * @property {Record<string, string>} errors the group's errors: its own under `''`, its checks' under `<index>.<field>`
 * @property {(next: GroupDraft) => void} onChange
 * @property {import('./ConditionFields.jsx').ConditionPickers} pickers
 * @property {{ accountId: string, currency: string }} defaults
 */

/**
 * A group of checks, edited in one window: "all" or "any" of them, and the checks as rows. A new
 * check first asks what it looks at.
 * @param {GroupFieldsProps} props
 * @returns {import('preact').JSX.Element}
 */
export function GroupFields({ value, errors, onChange, pickers, defaults }) {
  const choosing = useSignal(false);
  const ownError = errors[''] ? t(errors['']) : null;
  return (
    <div className={styles.root}>
      <Select
        label={t('automations.match')}
        value={value.match}
        options={MATCH_MODES.map((m) => ({ value: m, label: t(`automations.match.${m}`) }))}
        error={errors.match ? t(errors.match) : null}
        onChange={(match) => onChange({ ...value, match })}
      />
      {ownError && (
        <p className={styles.error} role="alert">
          {ownError}
        </p>
      )}
      <ul className={styles.items}>
        {value.items.map((item, i) => (
          <li key={item.key}>
            <ConditionFields
              value={item}
              errors={errorsUnder(errors, `${i}.`)}
              onChange={(patch) =>
                onChange({
                  ...value,
                  items: value.items.map((x, j) => (j === i ? { ...x, ...patch } : x)),
                })
              }
              onRemove={() => onChange({ ...value, items: value.items.filter((_, j) => j !== i) })}
              pickers={pickers}
            />
          </li>
        ))}
      </ul>
      {choosing.value ? (
        <fieldset className={styles.choose}>
          <legend className={styles.legend}>{t('automations.addCheckTitle')}</legend>
          <div className={styles.fields}>
            {CONDITION_FIELDS.map((field) => (
              <Button
                key={field}
                onClick={() => {
                  choosing.value = false;
                  onChange({ ...value, items: [...value.items, conditionDraft(field, defaults)] });
                }}
              >
                {t(`automations.field.${field}`)}
              </Button>
            ))}
          </div>
        </fieldset>
      ) : (
        <Button icon="plus" onClick={() => (choosing.value = true)}>
          {t('automations.addCheck')}
        </Button>
      )}
    </div>
  );
}
