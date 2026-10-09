import { useSignal, useSignalEffect } from '@preact/signals';
import { CONDITION_FIELDS, MATCH_MODES } from '../../../core/domain/automation.js';
import { ValidationError } from '../../../core/errors.js';
import { Button } from '../../components/Button.jsx';
import { DateInput } from '../../components/DateInput.jsx';
import { InlineMessage } from '../../components/InlineMessage.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { Select } from '../../components/Select.jsx';
import { TextField } from '../../components/TextField.jsx';
import { useFormState } from '../../hooks/useFormState.js';
import { t } from '../../i18n/i18n.js';
import { ActionFields } from './ActionFields.jsx';
import { AddItemDialog } from './AddItemDialog.jsx';
import {
  actionDraft,
  conditionDraft,
  groupDraft,
  isGroupDraft,
  reactsToTransactions,
  suggestedName,
  triggerDraft,
  triggerInput,
} from './automationDraft.js';
import {
  describeAction,
  describeCondition,
  describeGroup,
  describeTrigger,
} from './automationText.js';
import { AutomationPreview } from './AutomationPreview.jsx';
import { ConditionFields } from './ConditionFields.jsx';
import { EntryRow } from './EntryRow.jsx';
import { GroupFields } from './GroupFields.jsx';
import { ItemDialog } from './ItemDialog.jsx';
import { TriggerFields } from './TriggerFields.jsx';
import styles from './AutomationEditor.module.css';

/** @typedef {import('./automationDraft.js').AutomationDraft} AutomationDraft */
/** @typedef {import('./automationDraft.js').TriggerDraft} TriggerDraft */
/** @typedef {import('./automationDraft.js').ConditionDraft} ConditionDraft */
/** @typedef {import('./automationDraft.js').GroupDraft} GroupDraft */
/** @typedef {import('./automationDraft.js').ActionDraft} ActionDraft */
/** @typedef {import('../../../core/services/AutomationService.js').AutomationPreview} Preview */
/** @typedef {'trigger' | 'condition' | 'action'} Section */

/**
 * The item open in its window. `index` is null for an item that isn't on the page yet.
 * @typedef {{ section: 'trigger', index: number | null, item: TriggerDraft }
 *   | { section: 'condition', index: number | null, item: ConditionDraft | GroupDraft }
 *   | { section: 'action', index: number | null, item: ActionDraft }} OpenItem
 */

/** Quiet time after the last change before the preview is worked out again. */
const PREVIEW_DELAY_MS = 250;
/** Errors that depend on other items; they show when the whole automation is saved. */
const CROSS_ITEM_ERRORS = new Set([
  'validation.percentNeedsEvent',
  'validation.conditionsNeedEvent',
]);
const LIST_PATHS = /** @type {const} */ ({
  trigger: 'triggers',
  condition: 'conditions',
  action: 'actions',
});

/**
 * @param {AutomationDraft} draft
 * @param {Section} section
 * @returns {ReadonlyArray<TriggerDraft | ConditionDraft | GroupDraft | ActionDraft>}
 */
function listOf(draft, section) {
  if (section === 'trigger') return draft.triggers;
  if (section === 'condition') return draft.conditions.items;
  return draft.actions;
}

/**
 * The draft with `item` put at `index` of its list (appended when `index` is null), or removed
 * from it when `item` is null.
 * @param {AutomationDraft} draft
 * @param {Section} section
 * @param {number | null} index
 * @param {TriggerDraft | ConditionDraft | GroupDraft | ActionDraft | null} item
 * @returns {AutomationDraft}
 */
function withItem(draft, section, index, item) {
  const list = [...listOf(draft, section)];
  if (item === null) list.splice(/** @type {number} */ (index), 1);
  else if (index === null) list.push(item);
  else list[index] = item;
  if (section === 'trigger') return { ...draft, triggers: /** @type {TriggerDraft[]} */ (list) };
  if (section === 'action') return { ...draft, actions: /** @type {ActionDraft[]} */ (list) };
  return {
    ...draft,
    conditions: {
      ...draft.conditions,
      items: /** @type {Array<ConditionDraft | GroupDraft>} */ (list),
    },
  };
}

/**
 * @typedef {object} AutomationEditorProps
 * @property {AutomationDraft} initial
 * @property {string} title
 * @property {string} today
 * @property {readonly { id: string, name: string, currency: string }[]} accounts
 * @property {readonly { id: string, name: string, kind: string }[]} categories
 * @property {readonly string[]} currencies currencies of the user's accounts
 * @property {{ accountId: string, currency: string }} defaults for new checks and steps
 * @property {(draft: AutomationDraft) => Promise<void>} onSubmit throws ValidationError for inline errors
 * @property {(draft: AutomationDraft) => Promise<Preview>} onPreview rejects while the draft is incomplete
 * @property {() => void} onCancel
 * @property {import('preact').ComponentChildren} [extraActions] Run now, history, stop, delete
 */

/**
 * The automation page's editor: the name, then "When", "If" and "Do" as lists of short lines.
 * Each line opens a small window for that item; "+ Add" first asks which kind of item, and the
 * kind never changes afterwards. Nothing is stored until Save.
 * @param {AutomationEditorProps} props
 * @returns {import('preact').JSX.Element}
 */
export function AutomationEditor({
  initial,
  title,
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
  const adding = useSignal(/** @type {Section | null} */ (null));
  const open = useSignal(/** @type {OpenItem | null} */ (null));
  const itemErrors = useSignal(/** @type {Record<string, string>} */ ({}));
  const checking = useSignal(false);
  const draft = form.draft.value;
  const errors = form.errors.value;

  /**
   * @param {string} id
   * @returns {string}
   */
  const currencyOf = (id) => accounts.find((a) => a.id === id)?.currency ?? defaults.currency;
  const names = {
    /**
     * @param {string} id
     * @returns {string}
     */
    account: (id) => accounts.find((a) => a.id === id)?.name ?? t('automations.text.noAccount'),
    /**
     * @param {string} id
     * @returns {string}
     */
    category: (id) => categories.find((c) => c.id === id)?.name ?? t('automations.text.noCategory'),
    currencyOf,
  };
  /**
   * @param {string} id
   * @returns {string | undefined}
   */
  const categoryName = (id) => categories.find((c) => c.id === id)?.name;
  const suggestion = suggestedName(draft, categoryName);
  const reacts = reactsToTransactions(draft);
  const allowPercent =
    draft.triggers.length > 0 && draft.triggers.every((x) => x.type === 'transactionRecorded');

  /**
   * @param {string} prefix e.g. `actions.0`
   * @returns {boolean}
   */
  const hasErrorsAt = (prefix) =>
    Object.keys(errors).some((path) => path === prefix || path.startsWith(`${prefix}.`));

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

  /** @param {AutomationDraft} next */
  const replaceDraft = (next) => {
    form.update(next);
    // Error paths are positions in the lists, which just changed.
    form.errors.value = {};
  };

  /** @param {OpenItem} item */
  const openItem = (item) => {
    itemErrors.value = {};
    open.value = item;
  };

  /** @param {string} choice */
  const choose = (choice) => {
    const section = adding.value;
    adding.value = null;
    if (section === 'trigger') {
      if (choice === 'transactionRecorded') {
        replaceDraft(withItem(draft, 'trigger', null, triggerDraft('transactionRecorded', today)));
      } else {
        openItem({ section, index: null, item: triggerDraft('schedule', today) });
      }
    } else if (section === 'condition') {
      openItem({
        section,
        index: null,
        item: choice === 'group' ? groupDraft() : conditionDraft(choice, defaults),
      });
    } else if (section === 'action') {
      openItem({
        section,
        index: null,
        item: actionDraft(/** @type {ActionDraft['type']} */ (choice), defaults),
      });
    }
  };

  /** @param {Partial<TriggerDraft>} patch */
  const patchTrigger = (patch) => {
    const item = open.value;
    if (item?.section === 'trigger') open.value = { ...item, item: { ...item.item, ...patch } };
  };
  /** @param {Partial<ConditionDraft>} patch */
  const patchCondition = (patch) => {
    const item = open.value;
    if (item?.section === 'condition' && !isGroupDraft(item.item)) {
      open.value = { ...item, item: { ...item.item, ...patch } };
    }
  };
  /** @param {GroupDraft} group */
  const setGroup = (group) => {
    const item = open.value;
    if (item?.section === 'condition') open.value = { ...item, item: group };
  };
  /** @param {Partial<ActionDraft>} patch */
  const patchAction = (patch) => {
    const item = open.value;
    if (item?.section === 'action') open.value = { ...item, item: { ...item.item, ...patch } };
  };

  // Puts the open item on the page after checking its own fields with the service.
  const done = async () => {
    const current = open.value;
    if (!current) return;
    const next = withItem(form.draft.peek(), current.section, current.index, current.item);
    const index = current.index ?? listOf(form.draft.peek(), current.section).length;
    const prefix = `${LIST_PATHS[current.section]}.${index}`;
    checking.value = true;
    /** @type {Record<string, string>} */
    const own = {};
    try {
      await onPreview(next);
    } catch (error) {
      if (error instanceof ValidationError) {
        for (const [path, key] of Object.entries(error.fields)) {
          if (CROSS_ITEM_ERRORS.has(key)) continue;
          if (path === prefix) own[''] = key;
          else if (path.startsWith(`${prefix}.`)) own[path.slice(prefix.length + 1)] = key;
        }
      }
    } finally {
      checking.value = false;
    }
    if (Object.keys(own).length > 0) {
      itemErrors.value = own;
      return;
    }
    replaceDraft(next);
    open.value = null;
  };

  const removeOpen = () => {
    const current = open.value;
    if (!current || current.index === null) return;
    replaceDraft(withItem(draft, current.section, current.index, null));
    open.value = null;
  };

  /** @param {SubmitEvent} event */
  const handleSubmit = async (event) => {
    event.preventDefault();
    await form.submit((value) =>
      onSubmit(value.name.trim() ? value : { ...value, name: suggestion }),
    );
  };

  /**
   * @param {Section} section
   * @param {number} index
   * @returns {() => void}
   */
  const remover = (section, index) => () => replaceDraft(withItem(draft, section, index, null));

  /**
   * @param {string} key the section's own error
   * @param {string} [required] message when nothing has been added
   * @returns {import('preact').JSX.Element | null}
   */
  const sectionError = (key, required) =>
    errors[key] ? (
      <p className={styles.error} role="alert">
        {errors[key] === 'validation.required' && required ? required : t(errors[key])}
      </p>
    ) : null;

  /**
   * @param {Section} section
   * @param {string} heading
   * @param {string} hint
   * @param {string} empty
   * @param {import('preact').ComponentChildren} lines
   * @param {import('preact').ComponentChildren} [extra]
   * @returns {import('preact').JSX.Element}
   */
  const sectionBlock = (section, heading, hint, empty, lines, extra) => (
    <section className={styles.section} aria-label={heading}>
      <div className={styles.sectionHead}>
        <h2 className={styles.heading}>{heading}</h2>
        <Button
          icon="plus"
          aria-label={t(`automations.addTo.${section}`)}
          onClick={() => (adding.value = section)}
        >
          {t('automations.addItem')}
        </Button>
      </div>
      <p className={styles.hint}>{hint}</p>
      {extra}
      {sectionError(LIST_PATHS[section], t(`automations.need.${section}`))}
      {listOf(draft, section).length === 0 ? (
        <p className={styles.empty}>{empty}</p>
      ) : (
        <ul className={styles.lines}>{lines}</ul>
      )}
    </section>
  );

  const current = open.value;
  /** @type {string} */
  let openTitle = '';
  if (current?.section === 'trigger') openTitle = t('automations.scheduleTitle');
  else if (current?.section === 'condition') {
    openTitle = isGroupDraft(current.item)
      ? t('automations.groupTitle')
      : t('automations.checkTitle', { field: t(`automations.field.${current.item.field}`) });
  } else if (current?.section === 'action')
    openTitle = t(`automations.action.${current.item.type}`);

  /** @type {Record<Section, import('./AddItemDialog.jsx').AddItemOption[]>} */
  const addOptions = {
    trigger: [
      {
        value: 'schedule',
        label: t('automations.trigger.schedule'),
        description: t('automations.trigger.scheduleHint'),
      },
      ...(reacts
        ? []
        : [
            {
              value: 'transactionRecorded',
              label: t('automations.trigger.transactionRecorded'),
              description: t('automations.trigger.transactionRecordedHint'),
            },
          ]),
    ],
    condition: [
      ...CONDITION_FIELDS.map((field) => ({
        value: field,
        label: t(`automations.field.${field}`),
      })),
      { value: 'group', label: t('automations.group'), description: t('automations.groupHint') },
    ],
    action: [
      {
        value: 'createTransaction',
        label: t('automations.action.createTransaction'),
        description: t('automations.action.createTransactionHint'),
      },
      {
        value: 'setBudget',
        label: t('automations.action.setBudget'),
        description: t('automations.action.setBudgetHint'),
      },
    ],
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <a href="/automations" className={styles.back}>
        {t('automations.back')}
      </a>
      <PageHeader
        title={title}
        actions={
          <>
            <Button onClick={onCancel}>{t('common.cancel')}</Button>
            <Button type="submit" variant="primary" disabled={form.busy.value}>
              {form.busy.value ? t('common.saving') : t('automations.save')}
            </Button>
          </>
        }
      />
      <TextField
        label={t('automations.name')}
        value={draft.name}
        placeholder={suggestion}
        error={errors.name ? t(errors.name) : null}
        autoComplete="off"
        onInput={(name) => form.update({ name })}
      />

      {sectionBlock(
        'trigger',
        t('automations.when'),
        t('automations.whenHint'),
        t('automations.empty.trigger'),
        draft.triggers.map((trigger, i) => (
          <li key={trigger.key}>
            <EntryRow
              text={describeTrigger(triggerInput(trigger, today))}
              onOpen={
                trigger.type === 'schedule'
                  ? () => openItem({ section: 'trigger', index: i, item: trigger })
                  : null
              }
              onRemove={remover('trigger', i)}
              removeLabel={t('automations.removeTrigger')}
              needsAttention={hasErrorsAt(`triggers.${i}`)}
            />
          </li>
        )),
      )}

      {(reacts || draft.conditions.items.length > 0) &&
        sectionBlock(
          'condition',
          t('automations.if'),
          t('automations.ifHint'),
          t('automations.empty.condition'),
          draft.conditions.items.map((item, i) => (
            <li key={item.key}>
              <EntryRow
                text={
                  isGroupDraft(item) ? describeGroup(item, names) : describeCondition(item, names)
                }
                onOpen={() => openItem({ section: 'condition', index: i, item })}
                onRemove={remover('condition', i)}
                removeLabel={
                  isGroupDraft(item) ? t('automations.removeGroup') : t('automations.removeCheck')
                }
                needsAttention={hasErrorsAt(`conditions.${i}`)}
              />
            </li>
          )),
          draft.conditions.items.length > 1 && (
            <Select
              label={t('automations.match')}
              value={draft.conditions.match}
              options={MATCH_MODES.map((m) => ({ value: m, label: t(`automations.match.${m}`) }))}
              onChange={(match) => form.update({ conditions: { ...draft.conditions, match } })}
            />
          ),
        )}

      {sectionBlock(
        'action',
        t('automations.do'),
        t('automations.doHint'),
        t('automations.empty.action'),
        draft.actions.map((action, i) => (
          <li key={action.key}>
            <EntryRow
              text={describeAction(action, names)}
              onOpen={() => openItem({ section: 'action', index: i, item: action })}
              onRemove={remover('action', i)}
              removeLabel={t('automations.removeAction')}
              needsAttention={hasErrorsAt(`actions.${i}`)}
            />
          </li>
        )),
      )}

      <div className={styles.dates}>
        <DateInput
          label={t('automations.startDate')}
          hint={t('automations.startHint')}
          value={draft.startDate}
          error={errors.startDate ? t(errors.startDate) : null}
          required
          onInput={(startDate) => form.update({ startDate })}
        />
        <DateInput
          label={t('common.optional', { label: t('automations.endDate') })}
          value={draft.endDate}
          error={errors.endDate ? t(errors.endDate) : null}
          onInput={(endDate) => form.update({ endDate })}
        />
      </div>

      <AutomationPreview
        preview={preview.value}
        hasSchedule={draft.triggers.some((x) => x.type === 'schedule')}
        reacts={reacts}
        currencyOf={currencyOf}
        categoryName={categoryName}
      />

      {Object.keys(errors).length > 0 && (
        <InlineMessage tone="error">{t('errors.validation')}</InlineMessage>
      )}
      {form.formError.value && <InlineMessage tone="error">{form.formError.value}</InlineMessage>}
      {extraActions && <div className={styles.extra}>{extraActions}</div>}

      <AddItemDialog
        open={adding.value !== null}
        title={adding.value ? t(`automations.addTo.${adding.value}`) : ''}
        options={adding.value ? addOptions[adding.value] : []}
        onChoose={choose}
        onClose={() => (adding.value = null)}
      />
      <ItemDialog
        open={current !== null}
        title={openTitle}
        onDone={() => void done()}
        onCancel={() => (open.value = null)}
        onDelete={current?.index !== null && current?.index !== undefined ? removeOpen : null}
        busy={checking.value}
      >
        {current?.section === 'trigger' && (
          <TriggerFields value={current.item} errors={itemErrors.value} onChange={patchTrigger} />
        )}
        {current?.section === 'condition' &&
          (isGroupDraft(current.item) ? (
            <GroupFields
              value={current.item}
              errors={itemErrors.value}
              onChange={setGroup}
              pickers={{ accounts, categories, currencies }}
              defaults={defaults}
            />
          ) : (
            <ConditionFields
              value={current.item}
              errors={itemErrors.value}
              onChange={patchCondition}
              onRemove={null}
              pickers={{ accounts, categories, currencies }}
            />
          ))}
        {current?.section === 'action' && (
          <ActionFields
            value={current.item}
            errors={itemErrors.value}
            onChange={patchAction}
            allowPercent={allowPercent}
            accounts={accounts}
            categories={categories}
          />
        )}
      </ItemDialog>
    </form>
  );
}
