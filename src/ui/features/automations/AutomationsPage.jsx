import { useStores } from '../../context/StoresProvider.jsx';
import { ButtonLink } from '../../components/ButtonLink.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { UpcomingList } from '../../components/UpcomingList.jsx';
import { t } from '../../i18n/i18n.js';
import { AutomationRow } from './AutomationRow.jsx';
import styles from './AutomationsPage.module.css';

/** @typedef {import('../../../core/services/AutomationService.js').AutomationSummary} AutomationSummary */

/**
 * Automations: the running and stopped ones, and what their schedules make in the next 30 days.
 * Each one, and "Create automation", opens the automation's own page.
 * @returns {import('preact').JSX.Element}
 */
export function AutomationsPage() {
  const { automations, accounts, categories, settings, router } = useStores();
  const summaries = automations.automations.value;
  const running = summaries.filter((s) => s.running);
  const stopped = summaries.filter((s) => !s.running);
  const accountById = accounts.byId.value;
  const categoryById = categories.byId.value;
  const defaultCurrency = settings.values.value.defaultCurrency;

  /**
   * @param {string} id
   * @returns {void}
   */
  const open = (id) => router.navigate(`/automations/${encodeURIComponent(id)}`);

  /**
   * @param {AutomationSummary[]} list
   * @param {string} label
   * @returns {import('preact').JSX.Element}
   */
  const automationList = (list, label) => (
    <ul className={styles.list} aria-label={label}>
      {list.map((summary) => (
        <li key={summary.automation.id}>
          <AutomationRow summary={summary} onSelect={open} />
        </li>
      ))}
    </ul>
  );

  const upcoming = automations.upcoming.value.map((item) => {
    const title =
      item.transaction.payee ||
      (item.transaction.categoryId ? categoryById.get(item.transaction.categoryId)?.name : '') ||
      item.name;
    return {
      key: `${item.automationId}:${item.triggerIndex}:${item.actionIndex}:${item.plannedDate}`,
      date: item.date,
      title,
      subtitle: item.name === title ? undefined : item.name,
      minor: item.transaction.amountMinor,
      currency: accountById.get(item.transaction.accountId)?.currency ?? defaultCurrency,
      kind: item.transaction.kind,
    };
  });

  const add = (
    <ButtonLink href="/automations/new" variant="primary" icon="plus">
      {t('automations.add')}
    </ButtonLink>
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
    </>
  );
}
