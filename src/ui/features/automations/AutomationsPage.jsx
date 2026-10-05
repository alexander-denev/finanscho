import { useSignal } from '@preact/signals';
import { canRunNow, referencedIds } from '../../../core/domain/automation.js';
import { useStores } from '../../context/StoresProvider.jsx';
import { Button } from '../../components/Button.jsx';
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx';
import { Dialog } from '../../components/Dialog.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { UpcomingList } from '../../components/UpcomingList.jsx';
import { errorMessage, t } from '../../i18n/i18n.js';
import { automationToDraft, newAutomationDraft, toAutomationInput } from './automationDraft.js';
import { AutomationForm } from './AutomationForm.jsx';
import { AutomationHistory } from './AutomationHistory.jsx';
import { AutomationRow } from './AutomationRow.jsx';
import styles from './AutomationsPage.module.css';

/** @typedef {import('./automationDraft.js').AutomationDraft} AutomationDraft */
/** @typedef {import('../../../core/services/AutomationService.js').AutomationSummary} AutomationSummary */
/** @typedef {{ id: string | null, budget?: { categoryId: string, limit: string } }} EditRequest */

/**
 * @typedef {object} AutomationsPageProps
 * @property {Record<string, string>} params `id` opens an automation; `categoryId` (and `limit`)
 *   open a new one that sets that budget every month
 */

/**
 * Automations: the running and stopped ones, what their schedules make in the next 30 days, and
 * the form to create or change one, with Run now, history, stop/resume, and delete.
 * @param {AutomationsPageProps} props
 * @returns {import('preact').JSX.Element}
 */
export function AutomationsPage({ params }) {
  const { automations, accounts, categories, settings, clock, toasts, router } = useStores();
  const editing = useSignal(/** @type {EditRequest | null} */ (null));
  const confirm = useSignal(/** @type {'stop' | 'delete' | null} */ (null));
  const history = useSignal(
    /** @type {{ name: string, data: Awaited<ReturnType<typeof automations.history>> } | null} */ (
      null
    ),
  );
  const actionError = useSignal(/** @type {string | null} */ (null));

  const summaries = automations.automations.value;
  const running = summaries.filter((s) => s.running);
  const stopped = summaries.filter((s) => !s.running);
  const accountById = accounts.byId.value;
  const categoryById = categories.byId.value;
  const defaultCurrency = settings.values.value.defaultCurrency;
  const today = clock.today();

  /** @type {EditRequest | null} */
  const routed = params.id
    ? { id: params.id }
    : params.categoryId
      ? { id: null, budget: { categoryId: params.categoryId, limit: params.limit ?? '' } }
      : null;
  const request = editing.value ?? routed;
  const editingSummary = request?.id
    ? summaries.find((s) => s.automation.id === request.id)
    : undefined;
  const isOpen = request !== null && (request.id === null || editingSummary !== undefined);

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
  const used = editingSummary
    ? referencedIds(editingSummary.automation)
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

  /** @type {AutomationDraft | null} */
  const initial = !isOpen
    ? null
    : editingSummary
      ? automationToDraft(editingSummary.automation, currencyOf, defaultCurrency)
      : newAutomationDraft({ today, ...defaults, budget: request?.budget });

  const close = () => {
    editing.value = null;
    confirm.value = null;
    actionError.value = null;
    if (routed) router.navigate('/automations');
  };

  /** @param {AutomationDraft} draft */
  const save = async (draft) => {
    const id = request?.id;
    if (id) await automations.edit(id, toAutomationInput(draft));
    else await automations.create(toAutomationInput(draft));
    toasts.show('toast.automationSaved');
    close();
  };

  /**
   * Runs an action on the open automation, closing the dialog when it succeeds.
   * @param {(id: string) => Promise<unknown>} action
   * @param {string} toastKey
   * @returns {Promise<void>}
   */
  const act = async (action, toastKey) => {
    const summary = editingSummary;
    if (!summary) return;
    try {
      await action(summary.automation.id);
      toasts.show(toastKey, { name: summary.automation.name });
      close();
    } catch (error) {
      confirm.value = null;
      actionError.value = errorMessage(error);
    }
  };

  const showHistory = async () => {
    const summary = editingSummary;
    if (!summary) return;
    try {
      const data = await automations.history(summary.automation.id);
      close();
      history.value = { name: summary.automation.name, data };
    } catch (error) {
      actionError.value = errorMessage(error);
    }
  };

  /**
   * @param {AutomationSummary[]} list
   * @param {string} label
   * @returns {import('preact').JSX.Element}
   */
  const automationList = (list, label) => (
    <ul className={styles.list} aria-label={label}>
      {list.map((summary) => (
        <li key={summary.automation.id}>
          <AutomationRow summary={summary} onSelect={(id) => (editing.value = { id })} />
        </li>
      ))}
    </ul>
  );

  const upcoming = automations.upcoming.value.map((item) => {
    const title =
      item.transaction.payee ||
      (item.transaction.categoryId ? categoryName(item.transaction.categoryId) : '') ||
      item.name;
    return {
      key: `${item.automationId}:${item.triggerIndex}:${item.actionIndex}:${item.plannedDate}`,
      date: item.date,
      title,
      subtitle: item.name === title ? undefined : item.name,
      minor: item.transaction.amountMinor,
      currency: currencyOf(item.transaction.accountId),
      kind: item.transaction.kind,
    };
  });

  const add = (
    <Button variant="primary" icon="plus" onClick={() => (editing.value = { id: null })}>
      {t('automations.add')}
    </Button>
  );

  return (
    <>
      <PageHeader title={t('automations.title')} actions={add} />
      {summaries.length === 0 ? (
        <EmptyState
          title={t('automations.empty.title')}
          body={t('automations.empty.body')}
          action={add}
        />
      ) : (
        <>
          {running.length > 0 && automationList(running, t('automations.title'))}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{t('automations.upcoming')}</h2>
            <UpcomingList items={upcoming} emptyText={t('dashboard.noUpcoming')} />
          </section>
          {stopped.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>{t('automations.stoppedSection')}</h2>
              {automationList(stopped, t('automations.stoppedSection'))}
            </section>
          )}
        </>
      )}
      <Dialog
        open={isOpen && confirm.value === null}
        title={editingSummary ? t('automations.edit') : t('automations.add')}
        onClose={close}
      >
        {initial && (
          <AutomationForm
            initial={initial}
            isEdit={Boolean(editingSummary)}
            today={today}
            accounts={pickerAccounts}
            categories={pickerCategories}
            currencies={currencies}
            defaults={defaults}
            onSubmit={save}
            onPreview={(draft) => automations.preview(toAutomationInput(draft))}
            onCancel={close}
            extraActions={
              editingSummary && (
                <div className={styles.extra}>
                  {actionError.value && (
                    <p className={styles.error} role="alert">
                      {actionError.value}
                    </p>
                  )}
                  <Button
                    icon="bolt"
                    disabled={!canRunNow(editingSummary.automation)}
                    title={
                      canRunNow(editingSummary.automation)
                        ? undefined
                        : t('automations.runNowPercent')
                    }
                    onClick={() => void act((id) => automations.runNow(id), 'toast.automationRan')}
                  >
                    {t('automations.runNow')}
                  </Button>
                  <Button icon="list" onClick={() => void showHistory()}>
                    {t('automations.history')}
                  </Button>
                  {editingSummary.running ? (
                    <Button variant="danger" onClick={() => (confirm.value = 'stop')}>
                      {t('automations.stop')}
                    </Button>
                  ) : (
                    <Button
                      icon="repeat"
                      onClick={() =>
                        void act((id) => automations.resume(id), 'toast.automationResumed')
                      }
                    >
                      {t('automations.resume')}
                    </Button>
                  )}
                  <Button variant="danger" icon="trash" onClick={() => (confirm.value = 'delete')}>
                    {t('common.delete')}
                  </Button>
                </div>
              )
            }
          />
        )}
      </Dialog>
      <ConfirmDialog
        open={isOpen && confirm.value !== null}
        title={confirm.value === 'stop' ? t('automations.stop') : t('common.delete')}
        message={
          confirm.value === 'stop' ? t('automations.stopConfirm') : t('automations.deleteConfirm')
        }
        confirmLabel={confirm.value === 'stop' ? t('automations.stop') : t('common.delete')}
        danger
        onConfirm={() =>
          void (confirm.value === 'stop'
            ? act((id) => automations.stop(id), 'toast.automationStopped')
            : act((id) => automations.remove(id), 'toast.automationDeleted'))
        }
        onCancel={() => (confirm.value = null)}
      />
      <Dialog
        open={history.value !== null}
        title={history.value ? t('automations.historyTitle', { name: history.value.name }) : ''}
        onClose={() => (history.value = null)}
      >
        {history.value && (
          <AutomationHistory
            history={history.value.data}
            currencyOf={currencyOf}
            categoryName={categoryName}
          />
        )}
      </Dialog>
    </>
  );
}
