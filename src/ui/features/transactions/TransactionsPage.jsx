import { useSignal } from '@preact/signals';
import { useStores } from '../../context/StoresProvider.jsx';
import { Amount } from '../../components/Amount.jsx';
import { Button } from '../../components/Button.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
import { InlineMessage } from '../../components/InlineMessage.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { formatDate, t } from '../../i18n/i18n.js';
import { TransactionDialog } from './TransactionDialog.jsx';
import { TransactionFilters } from './TransactionFilters.jsx';
import { TransactionListItem } from './TransactionListItem.jsx';
import styles from './TransactionsPage.module.css';

/**
 * Filtered, day-grouped transaction ledger with paging and an add/edit dialog.
 * @returns {import('preact').JSX.Element}
 */
export function TransactionsPage() {
  const { transactions, accounts, categories, clock } = useStores();
  const dialog = useSignal(/** @type {{ id: string | null } | null} */ (null));
  const accountById = accounts.byId.value;
  const categoryById = categories.byId.value;
  const filter = transactions.filter.value;
  const days = transactions.days.value;
  const filtered = Boolean(
    filter.accountId || filter.categoryId || filter.uncategorized || filter.month || filter.search,
  );

  /** @param {string | null} id */
  const openDialog = (id) => {
    dialog.value = { id };
  };

  return (
    <>
      <PageHeader
        title={t('transactions.title')}
        actions={
          <Button variant="primary" icon="plus" onClick={() => openDialog(null)}>
            {t('transactions.add')}
          </Button>
        }
      />
      <TransactionFilters
        filter={filter}
        onChange={(changes) => void transactions.setFilter(changes)}
        onClear={() => void transactions.clearFilter()}
        accounts={accounts.active.value.map(({ account }) => account)}
        categories={categories.all.value}
        today={clock.today()}
      />
      {transactions.status.value === 'error' && (
        <InlineMessage
          tone="error"
          action={<Button onClick={() => void transactions.load()}>{t('common.retry')}</Button>}
        >
          {t('errors.load')}
        </InlineMessage>
      )}
      {days.length === 0 && transactions.status.value !== 'loading' ? (
        filtered ? (
          <EmptyState
            title={t('transactions.emptyFiltered.title')}
            body={t('transactions.emptyFiltered.body')}
            action={
              <Button onClick={() => void transactions.clearFilter()}>
                {t('transactions.clearFilters')}
              </Button>
            }
          />
        ) : (
          <EmptyState
            title={t('transactions.empty.title')}
            body={t('transactions.empty.body')}
            action={
              <Button variant="primary" icon="plus" onClick={() => openDialog(null)}>
                {t('transactions.add')}
              </Button>
            }
          />
        )
      ) : (
        <>
          {transactions.total.value.length > 0 && (
            <p className={styles.total}>
              <span>{t('transactions.total')}</span>
              {transactions.total.value.map((total) => (
                <Amount
                  key={total.currency}
                  minor={total.amountMinor}
                  currency={total.currency}
                  kind="signed"
                />
              ))}
            </p>
          )}
          {days.map((day) => (
            <section key={day.date} className={styles.day} aria-labelledby={`day-${day.date}`}>
              <header className={styles.dayHeader}>
                <h2 id={`day-${day.date}`} className={styles.dayTitle}>
                  {formatDate(day.date, 'weekday')}
                </h2>
                <span className={styles.dayNet}>
                  <span className="visually-hidden">{t('transactions.dayNet')} </span>
                  {day.net.map((net) => (
                    <Amount
                      key={net.currency}
                      minor={net.amountMinor}
                      currency={net.currency}
                      kind="signed"
                    />
                  ))}
                </span>
              </header>
              <ul>
                {day.items.map((tx) => {
                  const category = tx.categoryId ? categoryById.get(tx.categoryId) : undefined;
                  return (
                    <li key={tx.id}>
                      <TransactionListItem
                        transaction={tx}
                        category={
                          category
                            ? { name: category.name, color: category.color, icon: category.icon }
                            : null
                        }
                        accountName={accountById.get(tx.accountId)?.name ?? ''}
                        toAccountName={
                          tx.toAccountId ? (accountById.get(tx.toAccountId)?.name ?? '') : ''
                        }
                        currency={accountById.get(tx.accountId)?.currency ?? 'EUR'}
                        onSelect={openDialog}
                      />
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          {transactions.hasMore.value && (
            <div className={styles.more}>
              <Button onClick={() => void transactions.loadMore()}>{t('common.loadMore')}</Button>
            </div>
          )}
        </>
      )}
      <TransactionDialog
        request={dialog}
        onClose={() => {
          dialog.value = null;
        }}
      />
    </>
  );
}
