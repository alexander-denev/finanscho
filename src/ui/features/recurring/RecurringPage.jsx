import { useSignal } from '@preact/signals';
import { toDecimalString } from '../../../core/domain/money.js';
import { useStores } from '../../context/StoresProvider.jsx';
import { Button } from '../../components/Button.jsx';
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx';
import { Dialog } from '../../components/Dialog.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { UpcomingList } from '../../components/UpcomingList.jsx';
import { t } from '../../i18n/i18n.js';
import { RecurringForm } from './RecurringForm.jsx';
import { RuleRow } from './RuleRow.jsx';
import styles from './RecurringPage.module.css';

/** @typedef {import('./RecurringForm.jsx').RecurringDraft} RecurringDraft */
/** @typedef {import('../../../core/domain/recurringRule.js').RuleTemplate} RuleTemplate */

/**
 * @param {RecurringDraft} draft
 * @returns {import('../../../core/domain/recurringRule.js').RecurringRuleInput}
 */
function toInput(draft) {
  const transfer = draft.kind === 'transfer';
  return {
    frequency: draft.frequency,
    interval: draft.interval,
    startDate: draft.startDate,
    endDate: draft.endDate || null,
    template: {
      kind: draft.kind,
      amount: draft.amount,
      accountId: draft.accountId,
      toAccountId: transfer ? draft.toAccountId || null : null,
      categoryId: transfer ? null : draft.categoryId || null,
      payee: draft.payee,
      note: draft.note,
    },
  };
}

/**
 * Recurring rules, their next dates, and everything due in the next 30 days.
 * @returns {import('preact').JSX.Element}
 */
export function RecurringPage() {
  const { recurring, accounts, categories, clock, toasts } = useStores();
  const editing = useSignal(/** @type {{ ruleId: string | null } | null} */ (null));
  const confirm = useSignal(/** @type {'stop' | 'delete' | null} */ (null));
  const accountById = accounts.byId.value;
  const categoryById = categories.byId.value;
  const summaries = recurring.rules.value;
  const editingSummary = summaries.find((s) => s.rule.id === editing.value?.ruleId);
  const activeAccounts = accounts.active.value.map(({ account }) => account);

  /**
   * @param {RuleTemplate} template
   * @returns {string}
   */
  const titleOf = (template) =>
    template.payee ||
    (template.categoryId ? categoryById.get(template.categoryId)?.name : undefined) ||
    t(`kind.${template.kind}`);

  /** @type {RecurringDraft} */
  const initial = editingSummary
    ? {
        ...editingSummary.rule.template,
        amount: toDecimalString(
          editingSummary.rule.template.amountMinor,
          accountById.get(editingSummary.rule.template.accountId)?.currency ?? 'EUR',
        ),
        categoryId: editingSummary.rule.template.categoryId ?? '',
        toAccountId: editingSummary.rule.template.toAccountId ?? '',
        date: '',
        frequency: editingSummary.rule.frequency,
        interval: String(editingSummary.rule.interval),
        startDate: editingSummary.nextDate ?? clock.today(),
        endDate: editingSummary.rule.endDate ?? '',
      }
    : {
        kind: 'expense',
        amount: '',
        categoryId: '',
        accountId: activeAccounts[0]?.id ?? '',
        toAccountId: '',
        date: '',
        payee: '',
        note: '',
        frequency: 'monthly',
        interval: '1',
        startDate: clock.today(),
        endDate: '',
      };

  const close = () => {
    editing.value = null;
    confirm.value = null;
  };
  /** @param {string | null} ruleId */
  const open = (ruleId) => {
    editing.value = { ruleId };
  };

  /** @param {RecurringDraft} draft */
  const save = async (draft) => {
    const ruleId = editing.value?.ruleId;
    if (ruleId) await recurring.edit(ruleId, toInput(draft));
    else await recurring.create(toInput(draft));
    toasts.show('toast.ruleSaved');
    close();
  };

  const runConfirmed = async () => {
    const ruleId = editing.value?.ruleId;
    const action = confirm.value;
    if (!ruleId || !action) return;
    if (action === 'stop') await recurring.stop(ruleId);
    else await recurring.remove(ruleId);
    toasts.show(action === 'stop' ? 'toast.ruleStopped' : 'toast.ruleDeleted');
    close();
  };

  const upcoming = recurring.upcoming.value.map((item) => ({
    key: `${item.ruleId}:${item.date}`,
    date: item.date,
    title: titleOf(item.template),
    minor: item.template.amountMinor,
    currency: accountById.get(item.template.accountId)?.currency ?? 'EUR',
    kind: item.template.kind,
  }));

  return (
    <>
      <PageHeader
        title={t('recurring.title')}
        actions={
          <Button variant="primary" icon="plus" onClick={() => open(null)}>
            {t('recurring.add')}
          </Button>
        }
      />
      {summaries.length === 0 ? (
        <EmptyState
          title={t('recurring.empty.title')}
          body={t('recurring.empty.body')}
          action={
            <Button variant="primary" icon="plus" onClick={() => open(null)}>
              {t('recurring.add')}
            </Button>
          }
        />
      ) : (
        <>
          <ul className={styles.list}>
            {summaries.map((summary) => {
              const template = summary.rule.template;
              const category = template.categoryId
                ? categoryById.get(template.categoryId)
                : undefined;
              return (
                <li key={summary.rule.id}>
                  <RuleRow
                    summary={summary}
                    title={titleOf(template)}
                    color={category?.color ?? null}
                    currency={accountById.get(template.accountId)?.currency ?? 'EUR'}
                    onSelect={open}
                  />
                </li>
              );
            })}
          </ul>
          <section className={styles.upcoming}>
            <h2 className={styles.sectionTitle}>{t('recurring.upcoming')}</h2>
            <UpcomingList items={upcoming} emptyText={t('dashboard.noUpcoming')} />
          </section>
        </>
      )}
      <Dialog
        open={editing.value !== null && confirm.value === null}
        title={editingSummary ? t('recurring.edit') : t('recurring.add')}
        onClose={close}
      >
        <RecurringForm
          initial={initial}
          isEdit={Boolean(editingSummary)}
          accounts={activeAccounts}
          categories={categories.active.value}
          onSubmit={save}
          onCancel={close}
          extraActions={
            editingSummary && (
              <>
                {editingSummary.nextDate && (
                  <Button variant="danger" onClick={() => (confirm.value = 'stop')}>
                    {t('recurring.stop')}
                  </Button>
                )}
                <Button variant="danger" icon="trash" onClick={() => (confirm.value = 'delete')}>
                  {t('common.delete')}
                </Button>
              </>
            )
          }
        />
      </Dialog>
      <ConfirmDialog
        open={confirm.value !== null}
        title={confirm.value === 'stop' ? t('recurring.stop') : t('common.delete')}
        message={
          confirm.value === 'stop' ? t('recurring.stopConfirm') : t('recurring.deleteConfirm')
        }
        confirmLabel={confirm.value === 'stop' ? t('recurring.stop') : t('common.delete')}
        danger
        onConfirm={() => void runConfirmed()}
        onCancel={() => (confirm.value = null)}
      />
    </>
  );
}
