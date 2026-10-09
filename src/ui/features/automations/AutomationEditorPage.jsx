import { useSignal } from '@preact/signals';
import { canRunNow, referencedIds } from '../../../core/domain/automation.js';
import { useStores } from '../../context/StoresProvider.jsx';
import { Button } from '../../components/Button.jsx';
import { ButtonLink } from '../../components/ButtonLink.jsx';
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx';
import { Dialog } from '../../components/Dialog.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
import { errorMessage, t } from '../../i18n/i18n.js';
import { automationToDraft, newAutomationDraft, toAutomationInput } from './automationDraft.js';
import { AutomationEditor } from './AutomationEditor.jsx';
import { AutomationHistory } from './AutomationHistory.jsx';
import styles from './AutomationEditorPage.module.css';

/** @typedef {import('./automationDraft.js').AutomationDraft} AutomationDraft */

/**
 * @typedef {object} AutomationEditorPageProps
 * @property {Record<string, string>} params `id` opens a saved automation; without it the page
 *   creates one, prefilled from `categoryId` and `limit` when it comes from a budget
 */

/**
 * The page for one automation: create or change it, and for a saved one Run now, its history,
 * stop/resume, and delete.
 * @param {AutomationEditorPageProps} props
 * @returns {import('preact').JSX.Element}
 */
export function AutomationEditorPage({ params }) {
  const { automations, accounts, categories, settings, clock, toasts, router } = useStores();
  const confirm = useSignal(/** @type {'stop' | 'delete' | null} */ (null));
  const history = useSignal(
    /** @type {Awaited<ReturnType<typeof automations.history>> | null} */ (null),
  );
  const actionError = useSignal(/** @type {string | null} */ (null));

  const today = clock.today();
  const defaultCurrency = settings.values.value.defaultCurrency;
  const accountById = accounts.byId.value;
  const categoryById = categories.byId.value;
  const summary = params.id
    ? automations.automations.value.find((s) => s.automation.id === params.id)
    : undefined;

  if (params.id && !summary) {
    return automations.status.value === 'loading' ? (
      <p className={styles.loading}>{t('common.loading')}</p>
    ) : (
      <EmptyState
        title={t('automations.notFound')}
        action={<ButtonLink href="/automations">{t('automations.back')}</ButtonLink>}
      />
    );
  }

  /**
   * @param {string} id
   * @returns {string}
   */
  const currencyOf = (id) => accountById.get(id)?.currency ?? defaultCurrency;
  /**
   * @param {string} id
   * @returns {string | undefined}
   */
  const categoryName = (id) => categoryById.get(id)?.name;

  // Pickers offer active accounts and categories, plus archived ones this automation still uses.
  const used = summary
    ? referencedIds(summary.automation)
    : { accountIds: new Set(), categoryIds: new Set() };
  const pickerAccounts = accounts.items.value
    .map(({ account }) => account)
    .filter((a) => !a.archived || used.accountIds.has(a.id));
  const pickerCategories = categories.all.value.filter(
    (c) => !c.archived || used.categoryIds.has(c.id),
  );
  const currencies = [...new Set(accounts.items.value.map(({ account }) => account.currency))];
  const defaults = {
    accountId: accounts.active.value[0]?.account.id ?? '',
    currency: defaultCurrency,
  };

  /** @type {AutomationDraft} */
  const initial = summary
    ? automationToDraft(summary.automation, { currencyOf, defaultCurrency, today })
    : newAutomationDraft({
        today,
        defaults,
        budget: params.categoryId
          ? { categoryId: params.categoryId, limit: params.limit ?? '' }
          : undefined,
      });

  const backToList = () => router.navigate('/automations');

  /** @param {AutomationDraft} draft */
  const save = async (draft) => {
    if (summary) await automations.edit(summary.automation.id, toAutomationInput(draft, today));
    else await automations.create(toAutomationInput(draft, today));
    toasts.show('toast.automationSaved');
    backToList();
  };

  /**
   * Runs an action on the saved automation. Stop, resume, and delete change the stored record, so
   * the page returns to the list rather than keep a draft that no longer matches it.
   * @param {(id: string) => Promise<unknown>} action
   * @param {string} toastKey
   * @param {boolean} leave
   * @returns {Promise<void>}
   */
  const act = async (action, toastKey, leave) => {
    if (!summary) return;
    confirm.value = null;
    try {
      await action(summary.automation.id);
      toasts.show(toastKey, { name: summary.automation.name });
      if (leave) backToList();
    } catch (error) {
      actionError.value = errorMessage(error);
    }
  };

  const showHistory = async () => {
    if (!summary) return;
    try {
      history.value = await automations.history(summary.automation.id);
    } catch (error) {
      actionError.value = errorMessage(error);
    }
  };

  const extraActions = summary && (
    <>
      {actionError.value && (
        <p className={styles.error} role="alert">
          {actionError.value}
        </p>
      )}
      <Button
        icon="bolt"
        disabled={!canRunNow(summary.automation)}
        title={canRunNow(summary.automation) ? undefined : t('automations.runNowPercent')}
        onClick={() => void act((id) => automations.runNow(id), 'toast.automationRan', false)}
      >
        {t('automations.runNow')}
      </Button>
      <Button icon="list" onClick={() => void showHistory()}>
        {t('automations.history')}
      </Button>
      {summary.running ? (
        <Button variant="danger" onClick={() => (confirm.value = 'stop')}>
          {t('automations.stop')}
        </Button>
      ) : (
        <Button
          icon="repeat"
          onClick={() => void act((id) => automations.resume(id), 'toast.automationResumed', true)}
        >
          {t('automations.resume')}
        </Button>
      )}
      <Button variant="danger" icon="trash" onClick={() => (confirm.value = 'delete')}>
        {t('common.delete')}
      </Button>
    </>
  );

  return (
    <>
      <AutomationEditor
        key={params.id ?? `new:${params.categoryId ?? ''}`}
        initial={initial}
        title={summary ? summary.automation.name : t('automations.add')}
        today={today}
        accounts={pickerAccounts}
        categories={pickerCategories}
        currencies={currencies}
        defaults={defaults}
        onSubmit={save}
        onPreview={(draft) => automations.preview(toAutomationInput(draft, today))}
        onCancel={backToList}
        extraActions={extraActions}
      />
      <ConfirmDialog
        open={confirm.value !== null}
        title={confirm.value === 'stop' ? t('automations.stop') : t('common.delete')}
        message={
          confirm.value === 'stop' ? t('automations.stopConfirm') : t('automations.deleteConfirm')
        }
        confirmLabel={confirm.value === 'stop' ? t('automations.stop') : t('common.delete')}
        danger
        onConfirm={() =>
          void (confirm.value === 'stop'
            ? act((id) => automations.stop(id), 'toast.automationStopped', true)
            : act((id) => automations.remove(id), 'toast.automationDeleted', true))
        }
        onCancel={() => (confirm.value = null)}
      />
      <Dialog
        open={history.value !== null}
        title={summary ? t('automations.historyTitle', { name: summary.automation.name }) : ''}
        onClose={() => (history.value = null)}
      >
        {history.value && (
          <AutomationHistory
            history={history.value}
            currencyOf={currencyOf}
            categoryName={categoryName}
          />
        )}
      </Dialog>
    </>
  );
}
