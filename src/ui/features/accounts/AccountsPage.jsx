import { useSignal } from '@preact/signals';
import { toDecimalString } from '../../../core/domain/money.js';
import { useStores } from '../../context/StoresProvider.jsx';
import { Amount } from '../../components/Amount.jsx';
import { BalanceList } from '../../components/BalanceList.jsx';
import { Button } from '../../components/Button.jsx';
import { Dialog } from '../../components/Dialog.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { t } from '../../i18n/i18n.js';
import { AccountForm } from './AccountForm.jsx';
import styles from './AccountsPage.module.css';

/** @typedef {import('./AccountForm.jsx').AccountDraft} AccountDraft */

/**
 * Accounts with balances; add, edit, archive, and restore.
 * @returns {import('preact').JSX.Element}
 */
export function AccountsPage() {
  const { accounts, settings, transactions, router, toasts } = useStores();
  const editing = useSignal(/** @type {{ id: string | null } | null} */ (null));
  const editingId = editing.value?.id ?? null;
  const account = editingId ? accounts.byId.value.get(editingId) : undefined;

  /** @type {AccountDraft} */
  const initial = account
    ? {
        name: account.name,
        type: account.type,
        currency: account.currency,
        openingBalance: toDecimalString(account.openingBalanceMinor, account.currency),
        color: account.color,
      }
    : {
        name: '',
        type: 'checking',
        currency: settings.values.value.defaultCurrency,
        openingBalance: '',
        color: 'teal',
      };

  const close = () => {
    editing.value = null;
  };

  /** @param {AccountDraft} draft */
  const save = async (draft) => {
    if (editingId) await accounts.update(editingId, draft);
    else await accounts.create(draft);
    toasts.show('toast.accountSaved');
    close();
  };

  /** @param {boolean} archived */
  const setArchived = async (archived) => {
    if (!editingId) return;
    await accounts.setArchived(editingId, archived);
    toasts.show('toast.accountSaved');
    close();
  };

  const viewTransactions = async () => {
    if (!editingId) return;
    close();
    await transactions.setFilter({
      accountId: editingId,
      categoryId: null,
      month: null,
      search: '',
    });
    router.navigate('/transactions');
  };

  /**
   * @param {import('../../../core/services/AccountService.js').AccountBalance[]} list
   * @returns {import('../../components/BalanceList.jsx').BalanceItem[]}
   */
  const toItems = (list) =>
    list.map(({ account: a, balanceMinor }) => ({
      id: a.id,
      name: a.name,
      subtitle: `${t(`accountType.${a.type}`)} · ${a.currency}`,
      color: a.color,
      minor: balanceMinor,
      currency: a.currency,
    }));

  const openEditor = (/** @type {string | null} */ id) => {
    editing.value = { id };
  };

  return (
    <>
      <PageHeader
        title={t('accounts.title')}
        actions={
          <Button variant="primary" icon="plus" onClick={() => openEditor(null)}>
            {t('accounts.add')}
          </Button>
        }
      />
      {accounts.items.value.length === 0 ? (
        <EmptyState
          title={t('accounts.empty.title')}
          body={t('accounts.empty.body')}
          action={
            <Button variant="primary" icon="plus" onClick={() => openEditor(null)}>
              {t('accounts.add')}
            </Button>
          }
        />
      ) : (
        <>
          <div className={styles.totals}>
            {accounts.totals.value.map((total) => (
              <Amount
                key={total.currency}
                minor={total.amountMinor}
                currency={total.currency}
                kind="signed"
                size="xl"
              />
            ))}
          </div>
          <BalanceList
            items={toItems(accounts.active.value)}
            onSelect={openEditor}
            label={t('accounts.title')}
          />
          {accounts.archived.value.length > 0 && (
            <section className={styles.archived}>
              <h2 className={styles.sectionTitle}>{t('accounts.archivedSection')}</h2>
              <BalanceList
                items={toItems(accounts.archived.value)}
                onSelect={openEditor}
                label={t('accounts.archivedSection')}
              />
            </section>
          )}
        </>
      )}
      <Dialog
        open={editing.value !== null}
        title={editingId ? t('accounts.edit') : t('accounts.add')}
        onClose={close}
      >
        <AccountForm
          initial={initial}
          isNew={!editingId}
          onSubmit={save}
          onCancel={close}
          extraActions={
            account && (
              <>
                <Button variant="ghost" onClick={() => void viewTransactions()}>
                  {t('accounts.viewTransactions')}
                </Button>
                <Button variant="danger" onClick={() => void setArchived(!account.archived)}>
                  {account.archived ? t('common.unarchive') : t('common.archive')}
                </Button>
              </>
            )
          }
        />
        {account && !account.archived && (
          <p className={styles.note}>{t('accounts.archiveConfirm')}</p>
        )}
      </Dialog>
    </>
  );
}
