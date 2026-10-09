import { accountIcon } from '../../../core/domain/account.js';
import { useStores } from '../../context/StoresProvider.jsx';
import { Amount } from '../../components/Amount.jsx';
import { BalanceList } from '../../components/BalanceList.jsx';
import { ButtonLink } from '../../components/ButtonLink.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
import { InlineMessage } from '../../components/InlineMessage.jsx';
import { ItemIcon } from '../../components/ItemIcon.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { ProgressBar } from '../../components/ProgressBar.jsx';
import { UpcomingList } from '../../components/UpcomingList.jsx';
import { formatMonth, formatPercent, t } from '../../i18n/i18n.js';
import { DashboardSection } from './DashboardSection.jsx';
import styles from './DashboardPage.module.css';

/**
 * Overview: balances, this month's flow, budget status, and what automations make soon.
 * @returns {import('preact').JSX.Element}
 */
export function DashboardPage() {
  const { dashboard, categories, accounts, install } = useStores();
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
        <UpcomingList items={upcoming} emptyText={t('dashboard.noUpcoming')} />
      </DashboardSection>
    </>
  );
}
