import { useSignal } from '@preact/signals';
import { toDecimalString } from '../../../core/domain/money.js';
import { useStores } from '../../context/StoresProvider.jsx';
import { Amount } from '../../components/Amount.jsx';
import { BalanceList } from '../../components/BalanceList.jsx';
import { Button } from '../../components/Button.jsx';
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx';
import { Dialog } from '../../components/Dialog.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
import { InlineMessage } from '../../components/InlineMessage.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { SegmentedControl } from '../../components/SegmentedControl.jsx';
import { errorMessage, t } from '../../i18n/i18n.js';
import { AccountForm } from './AccountForm.jsx';
import styles from './AccountsPage.module.css';

/** @typedef {import('./AccountForm.jsx').AccountDraft} AccountDraft */

/** The route that opens the add dialog, linked from outside the Accounts page. */
const ADD_PATH = '/accounts/new';

/**
 * Accounts with balances; add, edit, archive, restore, and delete unused ones. Archived accounts
 * live on their own tab, shown once there is one. On `/accounts/new` the add dialog opens at once.
 * @returns {import('preact').JSX.Element}
 */
export function AccountsPage() {
  const { accounts, settings, transactions, router, toasts } = useStores();
  const editing = useSignal(/** @type {{ id: string | null } | null} */ (null));
  const tab = useSignal(/** @type {'active' | 'archived'} */ ('active'));
  const confirmDelete = useSignal(false);
  const deleteBlocked = useSignal(false);
  const deleteError = useSignal(/** @type {string | null} */ (null));
  const adding = router.currentPath.value === ADD_PATH;
  const request = adding ? { id: null } : editing.value;
  const editingId = request?.id ?? null;
  const account = editingId ? accounts.byId.value.get(editingId) : undefined;
  const archivedItems = accounts.archived.value;
  const showArchived = tab.value === 'archived' && archivedItems.length > 0;

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
    confirmDelete.value = false;
    deleteBlocked.value = false;
    deleteError.value = null;
    if (router.currentPath.peek() === ADD_PATH) router.navigate('/accounts');
  };

  /**
   * Archived and deleted accounts aren't offered as transaction filters, so drop a filter on one.
   * @param {string} id
   */
  const dropFilterOn = async (id) => {
    if (transactions.filter.peek().accountId === id)
      await transactions.setFilter({ accountId: null });
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
    if (archived) await dropFilterOn(editingId);
    toasts.show('toast.accountSaved');
    close();
  };

  const askDelete = async () => {
    if (!editingId) return;
    deleteError.value = null;
    if (await accounts.canRemove(editingId)) confirmDelete.value = true;
    else deleteBlocked.value = true;
  };

  const remove = async () => {
    if (!editingId) return;
    try {
      await accounts.remove(editingId);
    } catch (error) {
      confirmDelete.value = false;
      deleteError.value = errorMessage(error);
      return;
    }
    await dropFilterOn(editingId);
    toasts.show('toast.accountDeleted');
    close();
  };

  const viewTransactions = async () => {
    if (!editingId) return;
    close();
    await transactions.setFilter({
      accountId: editingId,
      categoryId: null,
      uncategorized: false,
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
          {archivedItems.length > 0 && (
            <div className={styles.tabs}>
              <SegmentedControl
                legend={t('accounts.show')}
                value={showArchived ? 'archived' : 'active'}
                options={[
                  {
                    value: 'active',
                    label: t('accounts.tab.active', { count: accounts.active.value.length }),
                  },
                  {
                    value: 'archived',
                    label: t('accounts.tab.archived', { count: archivedItems.length }),
                  },
                ]}
                onChange={(value) => {
                  tab.value = value === 'archived' ? 'archived' : 'active';
                }}
              />
            </div>
          )}
          {showArchived ? (
            <>
              <p className={styles.intro}>{t('accounts.archivedIntro')}</p>
              <BalanceList
                items={toItems(archivedItems)}
                onSelect={openEditor}
                label={t('accounts.archivedSection')}
              />
            </>
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
            </>
          )}
        </>
      )}
      <Dialog
        open={request !== null && !confirmDelete.value}
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
                {!account.archived && (
                  <Button variant="ghost" onClick={() => void viewTransactions()}>
                    {t('accounts.viewTransactions')}
                  </Button>
                )}
                <Button variant="danger" onClick={() => void setArchived(!account.archived)}>
                  {account.archived ? t('common.unarchive') : t('common.archive')}
                </Button>
                <Button variant="danger" icon="trash" onClick={() => void askDelete()}>
                  {t('common.delete')}
                </Button>
              </>
            )
          }
        />
        {deleteBlocked.value && (
          <div className={styles.message}>
            <InlineMessage tone="error">{t('accounts.deleteBlocked')}</InlineMessage>
          </div>
        )}
        {deleteError.value && (
          <div className={styles.message}>
            <InlineMessage tone="error">{deleteError.value}</InlineMessage>
          </div>
        )}
        {account && !account.archived && (
          <p className={styles.note}>{t('accounts.archiveConfirm')}</p>
        )}
      </Dialog>
      <ConfirmDialog
        open={request !== null && confirmDelete.value}
        title={t('accounts.delete')}
        message={t('accounts.deleteConfirm', { name: account?.name ?? '' })}
        confirmLabel={t('accounts.delete')}
        danger
        onConfirm={() => void remove()}
        onCancel={() => {
          confirmDelete.value = false;
        }}
      />
    </>
  );
}
