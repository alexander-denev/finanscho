import { MATCH_MODES } from '../../../core/domain/automation.js';
import { Button } from '../../components/Button.jsx';
import { Select } from '../../components/Select.jsx';
import { t } from '../../i18n/i18n.js';
import { conditionDraft, errorsUnder, groupDraft, isGroupDraft } from './automationDraft.js';
import { ConditionFields } from './ConditionFields.jsx';
import styles from './ConditionGroupFields.module.css';

/** @typedef {import('./automationDraft.js').ConditionsDraft} ConditionsDraft */
/** @typedef {import('./automationDraft.js').ConditionDraft} ConditionDraft */
/** @typedef {import('./automationDraft.js').GroupDraft} GroupDraft */

/**
 * @typedef {object} ConditionGroupFieldsProps
 * @property {ConditionsDraft | GroupDraft} value
 * @property {string} path error path of this group: `conditions` or `conditions.<index>`
 * @property {Record<string, string>} errors every form error (dotted paths)
 * @property {(next: ConditionsDraft | GroupDraft) => void} onChange
 * @property {(() => void) | null} onRemove set for nested groups
 * @property {import('./ConditionFields.jsx').ConditionPickers} pickers
 * @property {{ accountId: string, currency: string }} defaults for new checks
 */

/**
 * The If checks: "all" or "any" of a list whose items are checks or (at the top level only) groups
 * with their own "all"/"any", so "(A and B) or C" and "A and (B or C)" can both be built.
 * @param {ConditionGroupFieldsProps} props
 * @returns {import('preact').JSX.Element}
 */
export function ConditionGroupFields({
  value,
  path,
  errors,
  onChange,
  onRemove,
  pickers,
  defaults,
}) {
  const nested = onRemove !== null;
  const ownError = errors[path] ? t(errors[path]) : null;
  /**
   * @param {Array<ConditionDraft | GroupDraft>} items
   * @returns {void}
   */
  const setItems = (items) => onChange({ ...value, items });

  return (
    <div className={nested ? styles.group : styles.top}>
      <div className={styles.head}>
        <Select
          label={nested ? t('automations.group') : t('automations.match')}
          value={value.match}
          options={MATCH_MODES.map((m) => ({ value: m, label: t(`automations.match.${m}`) }))}
          error={errors[`${path}.match`] ? t(errors[`${path}.match`]) : null}
          onChange={(match) => onChange({ ...value, match })}
        />
        {onRemove && (
          <Button
            variant="ghost"
            icon="trash"
            aria-label={t('automations.removeGroup')}
            onClick={onRemove}
          />
        )}
      </div>
      {ownError && (
        <p className={styles.error} role="alert">
          {ownError}
        </p>
      )}
      <ul className={styles.items}>
        {value.items.map((item, i) => {
          const itemPath = `${path}.${i}`;
          /**
           * @param {ConditionDraft | GroupDraft} next
           * @returns {void}
           */
          const replace = (next) => setItems(value.items.map((x, j) => (j === i ? next : x)));
          const remove = () => setItems(value.items.filter((_, j) => j !== i));
          return (
            <li key={item.key}>
              {isGroupDraft(item) ? (
                <ConditionGroupFields
                  value={item}
                  path={itemPath}
                  errors={errors}
                  onChange={(next) => replace(/** @type {GroupDraft} */ (next))}
                  onRemove={remove}
                  pickers={pickers}
                  defaults={defaults}
                />
              ) : (
                <ConditionFields
                  value={item}
                  errors={errorsUnder(errors, `${itemPath}.`)}
                  onChange={(patch) => replace({ ...item, ...patch })}
                  onRemove={remove}
                  pickers={pickers}
                />
              )}
            </li>
          );
        })}
      </ul>
      <div className={styles.actions}>
        <Button icon="plus" onClick={() => setItems([...value.items, conditionDraft(defaults)])}>
          {t('automations.addCheck')}
        </Button>
        {!nested && (
          <Button icon="plus" onClick={() => setItems([...value.items, groupDraft(defaults)])}>
            {t('automations.addGroup')}
          </Button>
        )}
      </div>
    </div>
  );
}
