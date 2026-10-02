import { useSignal, useSignalEffect } from '@preact/signals';
import { toDecimalString } from '../../../core/domain/money.js';
import { useStores } from '../../context/StoresProvider.jsx';
import { ButtonLink } from '../../components/ButtonLink.jsx';
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx';
import { Dialog } from '../../components/Dialog.jsx';
import { InlineMessage } from '../../components/InlineMessage.jsx';
import { errorMessage, t } from '../../i18n/i18n.js';
import { TransactionForm } from './TransactionForm.jsx';

/** @typedef {import('../../components/TransactionFields.jsx').TransactionDraft} TransactionDraft */
/** @typedef {{ id: string | null }} TransactionDialogRequest id null = add */

/**
 * @typedef {object} TransactionDialogProps
 * @property {import('@preact/signals').ReadonlySignal<TransactionDialogRequest | null>} request
 * @property {() => void} onClose
 */

/**
 * Converts form input to the service input shape.
 * @param {TransactionDraft} draft
 * @returns {import('../../../core/domain/transaction.js').TransactionInput}
 */
function toInput(draft) {
  const transfer = draft.kind === 'transfer';
  return {
    kind: draft.kind,
    date: draft.date,
    amount: draft.amount,
    accountId: draft.accountId,
    toAccountId: transfer ? draft.toAccountId || null : null,
    categoryId: transfer ? null : draft.categoryId || null,
    payee: draft.payee,
    note: draft.note,
  };
}

/**
 * Add/edit transaction dialog. Loads defaults (today, last used account) or the transaction to
 * edit, then saves through the transactions store.
 * @param {TransactionDialogProps} props
 * @returns {import('preact').JSX.Element}
 */
export function TransactionDialog({ request, onClose }) {
  const { transactions, accounts, categories, toasts } = useStores();
  const initial = useSignal(/** @type {TransactionDraft | null} */ (null));
  const loadError = useSignal(/** @type {string | null} */ (null));
  const payeeSuggestions = useSignal(
    /** @type {import('../../components/TransactionFields.jsx').PayeeSuggestion[]} */ ([]),
  );
  const confirmDelete = useSignal(false);
  const editingId = request.value?.id ?? null;

  // Reactive effect: prepare the draft whenever a new request arrives.
  useSignalEffect(() => {
    const current = request.value;
    initial.value = null;
    loadError.value = null;
    if (!current) return;
    let cancelled = false;
    const load = async () => {
      if (current.id) {
        const tx = await transactions.get(current.id);
        const currency = accounts.byId.peek().get(tx.accountId)?.currency ?? 'EUR';
        return {
          kind: tx.kind,
          amount: toDecimalString(tx.amountMinor, currency),
          categoryId: tx.categoryId ?? '',
          accountId: tx.accountId,
          toAccountId: tx.toAccountId ?? '',
          date: tx.date,
          payee: tx.payee,
          note: tx.note,
        };
      }
      const defaults = await transactions.defaults();
      return {
        kind: 'expense',
        amount: '',
        categoryId: '',
        accountId: defaults.accountId ?? '',
        toAccountId: '',
        date: defaults.date,
        payee: '',
        note: '',
      };
    };
    // Suggestions are a convenience: the form opens without them if they fail to load.
    transactions.payeeSuggestions().then(
      (suggestions) => {
        if (!cancelled) payeeSuggestions.value = suggestions;
      },
      () => {},
    );
    load().then(
      (draft) => {
        if (!cancelled) initial.value = draft;
      },
      (error) => {
        if (!cancelled) loadError.value = errorMessage(error);
      },
    );
    return () => {
      cancelled = true;
    };
  });

  const activeAccounts = accounts.active.value.map(({ account }) => account);
  const needsAccount = activeAccounts.length === 0 && !editingId;
  // Open once the draft is ready, so the amount field exists when focus moves into the dialog.
  const open =
    request.value !== null && (initial.value !== null || loadError.value !== null || needsAccount);
  const title = editingId ? t('transactions.edit') : t('transactions.add');

  /** @param {TransactionDraft} draft */
  const save = async (draft) => {
    await transactions.save(toInput(draft), editingId);
    toasts.show('toast.transactionSaved');
    onClose();
  };

  const remove = async () => {
    confirmDelete.value = false;
    if (!editingId) return;
    await transactions.remove(editingId);
    toasts.show('toast.transactionDeleted');
    onClose();
  };

  return (
    <>
      <Dialog open={open && !confirmDelete.value} title={title} onClose={onClose}>
        {loadError.value && <InlineMessage tone="error">{loadError.value}</InlineMessage>}
        {!loadError.value && needsAccount && (
          <InlineMessage
            action={
              <ButtonLink href="#/accounts" variant="primary">
                {t('accounts.add')}
              </ButtonLink>
            }
          >
            {t('transactions.needAccount')}
          </InlineMessage>
        )}
        {initial.value && (activeAccounts.length > 0 || editingId) && (
          <TransactionForm
            initial={initial.value}
            accounts={activeAccounts}
            categories={categories.active.value}
            payeeSuggestions={payeeSuggestions.value}
            onSubmit={save}
            onCancel={onClose}
            onDelete={
              editingId
                ? () => {
                    confirmDelete.value = true;
                  }
                : undefined
            }
          />
        )}
      </Dialog>
      <ConfirmDialog
        open={open && confirmDelete.value}
        title={t('transactions.delete')}
        message={t('transactions.deleteConfirm')}
        confirmLabel={t('transactions.delete')}
        danger
        onConfirm={() => void remove()}
        onCancel={() => {
          confirmDelete.value = false;
        }}
      />
    </>
  );
}
