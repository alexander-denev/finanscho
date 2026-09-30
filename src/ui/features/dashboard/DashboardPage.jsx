import { useStores } from '../../context/StoresProvider.jsx';
import { Amount } from '../../components/Amount.jsx';
import { BalanceList } from '../../components/BalanceList.jsx';
import { ButtonLink } from '../../components/ButtonLink.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { ProgressBar } from '../../components/ProgressBar.jsx';
import { UpcomingList } from '../../components/UpcomingList.jsx';
import { formatMonth, formatPercent, t } from '../../i18n/i18n.js';
import { DashboardSection } from './DashboardSection.jsx';
import styles from './DashboardPage.module.css';

/**
 * Overview: balances, this month's flow, budget status, and upcoming recurring transactions.
 * @returns {import('preact').JSX.Element}
 */
export function DashboardPage() {
  const { dashboard, categories, accounts } = useStores();
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
        <EmptyState
          title={t('dashboard.empty.title')}
          body={t('dashboard.empty.body')}
          action={
            <ButtonLink href="#/accounts" variant="primary" icon="plus">
              {t('dashboard.empty.action')}
            </ButtonLink>
          }
        />
      </>
    );
  }

  const upcoming = summary.upcoming.map((item) => ({
    key: `${item.ruleId}:${item.date}`,
    date: item.date,
    title:
      item.template.payee ||
      (item.template.categoryId ? categoryById.get(item.template.categoryId)?.name : undefined) ||
      t(`kind.${item.template.kind}`),
    minor: item.template.amountMinor,
    currency: accountById.get(item.template.accountId)?.currency ?? 'EUR',
    kind: item.template.kind,
  }));
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
        link={{ href: '#/accounts', label: t('dashboard.viewAll') }}
      >
        <BalanceList
          items={summary.balances.map(({ account, balanceMinor }) => ({
            id: account.id,
            name: account.name,
            color: account.color,
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
          href: '#/budgets',
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
                  <span>{line.category.name}</span>
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
        link={{ href: '#/recurring', label: t('dashboard.viewAll') }}
      >
        <UpcomingList items={upcoming} emptyText={t('dashboard.noUpcoming')} />
      </DashboardSection>
    </>
  );
}
