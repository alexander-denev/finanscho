import { useSignal } from '@preact/signals';
import { budgetProgress } from '../../../core/domain/budget.js';
import { toDecimalString } from '../../../core/domain/money.js';
import { useStores } from '../../context/StoresProvider.jsx';
import { Button } from '../../components/Button.jsx';
import { Dialog } from '../../components/Dialog.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
import { MonthPicker } from '../../components/MonthPicker.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { ProgressBar } from '../../components/ProgressBar.jsx';
import { formatMoney, formatPercent, t } from '../../i18n/i18n.js';
import { BudgetForm } from './BudgetForm.jsx';
import { BudgetRow } from './BudgetRow.jsx';
import styles from './BudgetsPage.module.css';

/** @typedef {import('./BudgetForm.jsx').BudgetDraft} BudgetDraft */

/**
 * Monthly budgets: month picker, totals, progress per category, and "Copy last month's budgets".
 * @returns {import('preact').JSX.Element}
 */
export function BudgetsPage() {
  const { budgets, settings, toasts } = useStores();
  const editing = useSignal(/** @type {{ budgetId: string | null } | null} */ (null));
  const data = budgets.data.value;
  const lines = data?.lines ?? [];
  const editingLine = lines.find((l) => l.budget.id === editing.value?.budgetId);
  const currency = editingLine?.budget.currency ?? settings.values.value.defaultCurrency;

  const close = () => {
    editing.value = null;
  };
  /** @param {string | null} budgetId */
  const open = (budgetId) => {
    editing.value = { budgetId };
  };

  /** @param {BudgetDraft} draft */
  const save = async (draft) => {
    await budgets.setBudget(draft.categoryId, draft.limit);
    toasts.show('toast.budgetSaved');
    close();
  };

  const remove = async () => {
    if (!editingLine) return;
    await budgets.removeBudget(editingLine.budget.id);
    toasts.show('toast.budgetRemoved');
    close();
  };

  const copy = async () => {
    try {
      const count = await budgets.copyPreviousMonth();
      if (count > 0) toasts.show('toast.budgetsCopied', { count });
      else toasts.show('toast.nothingToCopy');
    } catch {
      toasts.show('errors.unknown', {}, 'error');
    }
  };

  const copyButton = <Button onClick={() => void copy()}>{t('budgets.copyPrevious')}</Button>;
  const addButton = (
    <Button
      variant="primary"
      icon="plus"
      onClick={() => open(null)}
      disabled={data?.unbudgeted.length === 0}
    >
      {t('budgets.add')}
    </Button>
  );

  return (
    <>
      <PageHeader title={t('budgets.title')} actions={addButton} />
      <div className={styles.toolbar}>
        <MonthPicker
          label={t('budgets.month')}
          value={budgets.month.value}
          fallback={budgets.month.value}
          onChange={(month) => {
            if (month) void budgets.setMonth(month);
          }}
        />
        {lines.length > 0 && copyButton}
      </div>
      {lines.length === 0 ? (
        <EmptyState
          title={t('budgets.empty.title')}
          body={t('budgets.empty.body')}
          action={
            <div className={styles.emptyActions}>
              {addButton}
              {copyButton}
            </div>
          }
        />
      ) : (
        <>
          {budgets.totals.value.map((total) => {
            const { ratio, status: tone } = budgetProgress(total.limitMinor, total.spentMinor);
            return (
              <section key={total.currency} className={styles.total}>
                <p className={styles.totalText}>
                  <span>{t('budgets.total')}</span>
                  <span className={styles.figures}>
                    {t('budgets.spentOf', {
                      spent: formatMoney(total.spentMinor, total.currency),
                      limit: formatMoney(total.limitMinor, total.currency),
                    })}
                  </span>
                </p>
                <ProgressBar
                  ratio={ratio}
                  tone={tone}
                  label={t('budgets.progressLabel', {
                    category: t('budgets.total'),
                    percent: formatPercent(ratio * 100),
                  })}
                />
              </section>
            );
          })}
          <ul className={styles.list}>
            {lines.map((line) => (
              <li key={line.budget.id}>
                <BudgetRow line={line} onSelect={open} />
              </li>
            ))}
          </ul>
          {data?.unbudgeted.length === 0 && (
            <p className={styles.note}>{t('budgets.allBudgeted')}</p>
          )}
        </>
      )}
      <Dialog
        open={editing.value !== null}
        title={editingLine ? t('budgets.edit') : t('budgets.add')}
        onClose={close}
      >
        <BudgetForm
          initial={
            editingLine
              ? {
                  categoryId: editingLine.category.id,
                  limit: toDecimalString(
                    editingLine.budget.limitMinor,
                    editingLine.budget.currency,
                  ),
                }
              : { categoryId: '', limit: '' }
          }
          categories={editingLine ? [editingLine.category] : (data?.unbudgeted ?? [])}
          currency={currency}
          onSubmit={save}
          onCancel={close}
          onRemove={editingLine ? () => void remove() : undefined}
        />
      </Dialog>
    </>
  );
}
