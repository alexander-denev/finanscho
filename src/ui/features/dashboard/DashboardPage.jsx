import { useSignal } from '@preact/signals';
import { accountIcon } from '../../../core/domain/account.js';
import { addDays } from '../../../core/domain/localDate.js';
import { useStores } from '../../context/StoresProvider.jsx';
import { Amount } from '../../components/Amount.jsx';
import { BalanceList } from '../../components/BalanceList.jsx';
import { ButtonLink } from '../../components/ButtonLink.jsx';
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
import { InlineMessage } from '../../components/InlineMessage.jsx';
import { ItemIcon } from '../../components/ItemIcon.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { ProgressBar } from '../../components/ProgressBar.jsx';
import { ToPayList } from '../../components/ToPayList.jsx';
import { toPayListItem } from '../../components/toPayListItem.js';
import { UpcomingList } from '../../components/UpcomingList.jsx';
import { useToPayActions } from '../../hooks/useToPayActions.js';
import { formatMonth, formatPercent, t } from '../../i18n/i18n.js';
import { DashboardSection } from './DashboardSection.jsx';
import styles from './DashboardPage.module.css';

/** Days ahead a To pay is listed on the dashboard (like what automations make soon). */
const TO_PAY_DAYS = 30;

/**
 * Overview: balances, this month's flow, budget status, and what's coming up: To pays (overdue,
 * due within 30 days, or without a due date) and what automations make soon.
 * @returns {import('preact').JSX.Element}
 */
export function DashboardPage() {
  const { dashboard, categories, accounts, install, toPays, router, clock } = useStores();
  const toPayActions = useToPayActions();
  const deletingToPay = useSignal(/** @type {{ id: string, automatic: boolean } | null} */ (null));
  const summary = dashboard.summary.value;
  const categoryById = categories.byId.value;
  const accountById = accounts.byId.value;

  if (!summary) {
    return (
      <>
        <PageHeader title={t('dashboard.title')} />
        <p aria-busy="true">{t('common.loading')}</p>
      </>
    );
  }

  if (summary.balances.length === 0) {
    return (
      <>
        <PageHeader title={t('dashboard.title')} />
        {install.showFreshInstallHint.value && (
          <div className={styles.hint}>
            <InlineMessage>
              <p className={styles.hintTitle}>{t('install.freshHint.title')}</p>
              <p>{t('install.freshHint.body')}</p>
              <div className={styles.hintAction}>
                <ButtonLink href="/settings" icon="settings">
                  {t('install.freshHint.action')}
                </ButtonLink>
              </div>
            </InlineMessage>
          </div>
        )}
        <EmptyState
          title={t('dashboard.empty.title')}
          body={t('dashboard.empty.body')}
          action={
            <ButtonLink href="/accounts/new" variant="primary" icon="plus">
              {t('dashboard.empty.action')}
            </ButtonLink>
          }
        />
      </>
    );
  }

  const upcoming = summary.upcoming.map((item) => {
    const title =
      item.transaction.payee ||
      (item.transaction.categoryId
        ? categoryById.get(item.transaction.categoryId)?.name
        : undefined) ||
      item.name;
    return {
      key: `${item.automationId}:${item.triggerIndex}:${item.actionIndex}:${item.plannedDate}`,
      date: item.date,
      title,
      subtitle: item.name === title ? undefined : item.name,
      minor: item.transaction.amountMinor,
      currency: accountById.get(item.transaction.accountId)?.currency ?? 'EUR',
      kind: item.transaction.kind,
    };
  });
  const { lines, over, near } = summary.budgets;
  const today = clock.today();
  const lastDueDay = addDays(today, TO_PAY_DAYS);
  const dueToPays = toPays.items.value
    .filter((toPay) => toPay.dueDate === null || toPay.dueDate <= lastDueDay)
    .map((toPay) => toPayListItem(toPay, { accounts: accountById, categories: categoryById }));

  const removeToPay = async () => {
    const target = deletingToPay.peek();
    deletingToPay.value = null;
    if (target) await toPayActions.remove(target.id);
  };

  return (
    <>
      <PageHeader title={t('dashboard.title')} />
      <section className={styles.headline} aria-labelledby="dash-total">
        <h2 id="dash-total" className={styles.headlineLabel}>
          {t('dashboard.netWorth')}
        </h2>
        <div className={styles.totals}>
          {summary.totals.map((total) => (
            <Amount
              key={total.currency}
              minor={total.amountMinor}
              currency={total.currency}
              kind="signed"
              size="xl"
            />
          ))}
        </div>
      </section>

      <DashboardSection
        id="dash-accounts"
        title={t('dashboard.accounts')}
        link={{ href: '/accounts', label: t('dashboard.viewAll') }}
      >
        <BalanceList
          items={summary.balances.map(({ account, balanceMinor }) => ({
            id: account.id,
            name: account.name,
            color: account.color,
            icon: accountIcon(account),
            minor: balanceMinor,
            currency: account.currency,
          }))}
        />
      </DashboardSection>

      <DashboardSection
        id="dash-month"
        title={`${t('dashboard.thisMonth')} · ${formatMonth(summary.month)}`}
      >
        {summary.monthFlow.length === 0 ? (
          <p className={styles.muted}>{t('transactions.empty.title')}</p>
        ) : (
          <dl className={styles.flow}>
            {summary.monthFlow.map((flow) => (
              <div key={flow.currency} className={styles.flowRow}>
                <div>
                  <dt>{t('dashboard.income')}</dt>
                  <dd>
                    <Amount
                      minor={flow.incomeMinor}
                      currency={flow.currency}
                      kind="income"
                      size="lg"
                    />
                  </dd>
                </div>
                <div>
                  <dt>{t('dashboard.expense')}</dt>
                  <dd>
                    <Amount
                      minor={flow.expenseMinor}
                      currency={flow.currency}
                      kind="expense"
                      size="lg"
                    />
                  </dd>
                </div>
              </div>
            ))}
          </dl>
        )}
      </DashboardSection>

      <DashboardSection
        id="dash-budgets"
        title={t('dashboard.budgets')}
        link={{
          href: '/budgets',
          label: lines.length ? t('dashboard.viewAll') : t('dashboard.setBudgets'),
        }}
      >
        {lines.length === 0 ? (
          <p className={styles.muted}>{t('dashboard.noBudgets')}</p>
        ) : (
          <>
            <p className={styles.budgetSummary}>
              {over + near === 0
                ? t('dashboard.budgetsOnTrack')
                : t('dashboard.budgetsSummary', { over, near })}
            </p>
            <ul className={styles.budgetList}>
              {lines.map((line) => (
                <li key={line.budget.id} className={styles.budgetItem}>
                  <span className={styles.budgetName}>
                    <ItemIcon icon={line.category.icon} color={line.category.color} size="sm" />
                    {line.category.name}
                  </span>
                  <ProgressBar
                    ratio={line.progress.ratio}
                    tone={line.progress.status}
                    label={t('budgets.progressLabel', {
                      category: line.category.name,
                      percent: formatPercent(
                        Number.isFinite(line.progress.ratio) ? line.progress.ratio * 100 : 100,
                      ),
                    })}
                  />
                </li>
              ))}
            </ul>
          </>
        )}
      </DashboardSection>

      <DashboardSection
        id="dash-upcoming"
        title={t('dashboard.upcoming')}
        link={{ href: '/automations', label: t('dashboard.viewAll') }}
      >
        {dueToPays.length > 0 && (
          <ToPayList
            label={t('toPay.list')}
            items={dueToPays}
            today={today}
            disabled={toPayActions.busy.value}
            onSelect={(id) => router.navigate(`/to-pay/${encodeURIComponent(id)}`)}
            onPay={(id) => void toPayActions.pay(id)}
            onDelete={(id) => {
              const automatic = dueToPays.find((item) => item.id === id)?.automatic ?? false;
              deletingToPay.value = { id, automatic };
            }}
          />
        )}
        {(upcoming.length > 0 || dueToPays.length === 0) && (
          <UpcomingList items={upcoming} emptyText={t('dashboard.noUpcoming')} />
        )}
      </DashboardSection>
      <ConfirmDialog
        open={deletingToPay.value !== null}
        title={t('toPay.delete')}
        message={
          deletingToPay.value?.automatic
            ? t('toPay.deleteAutomaticConfirm')
            : t('toPay.deleteConfirm')
        }
        confirmLabel={t('toPay.delete')}
        danger
        onConfirm={() => void removeToPay()}
        onCancel={() => {
          deletingToPay.value = null;
        }}
      />
    </>
  );
}
