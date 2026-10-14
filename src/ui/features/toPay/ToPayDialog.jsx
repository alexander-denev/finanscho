import { useSignal, useSignalEffect } from '@preact/signals';
import { toDecimalString } from '../../../core/domain/money.js';
import { useStores } from '../../context/StoresProvider.jsx';
import { Button } from '../../components/Button.jsx';
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx';
import { Dialog } from '../../components/Dialog.jsx';
import { InlineMessage } from '../../components/InlineMessage.jsx';
import { useToPayActions } from '../../hooks/useToPayActions.js';
import { errorMessage, t } from '../../i18n/i18n.js';
import { ToPayForm } from './ToPayForm.jsx';

/** @typedef {import('./ToPayForm.jsx').ToPayDraft} ToPayDraft */
/** @typedef {{ id: string | null }} ToPayDialogRequest id null = add */
/** @typedef {{ id: string, name: string | null }} MadeBy name null: the automation was deleted */

/**
 * @typedef {object} ToPayDialogProps
 * @property {import('@preact/signals').ReadonlySignal<ToPayDialogRequest | null>} request
 * @property {() => void} onClose
 */

/**
 * Converts form input to the service input shape.
 * @param {ToPayDraft} draft
 * @returns {import('../../../core/domain/toPay.js').ToPayInput}
 */
function toInput(draft) {
  const transfer = draft.kind === 'transfer';
  return {
    kind: draft.kind,
    amount: draft.amount,
    accountId: draft.accountId,
    toAccountId: transfer ? draft.toAccountId || null : null,
    categoryId: transfer ? null : draft.categoryId || null,
    payee: draft.payee,
    note: draft.note,
    dueDate: draft.dueDate || null,
  };
}

/**
 * Add/edit To pay dialog. Editing also offers Pay (saves the form first, so it pays what is
 * shown) and Delete; a To pay an automation made says which one, with a link to it.
 * @param {ToPayDialogProps} props
 * @returns {import('preact').JSX.Element}
 */
export function ToPayDialog({ request, onClose }) {
  const { toPays, transactions, automations, accounts, categories, toasts, router } = useStores();
  const actions = useToPayActions();
  const initial = useSignal(/** @type {ToPayDraft | null} */ (null));
  const loadError = useSignal(/** @type {string | null} */ (null));
  const payeeSuggestions = useSignal(
    /** @type {import('../../components/TransactionFields.jsx').PayeeSuggestion[]} */ ([]),
  );
  const confirmDelete = useSignal(false);
  const madeBy = useSignal(/** @type {MadeBy | null} */ (null));
  const editingId = request.value?.id ?? null;

  // Reactive effect: prepare the draft whenever a new request arrives.
  useSignalEffect(() => {
    const current = request.value;
    initial.value = null;
    loadError.value = null;
    madeBy.value = null;
    confirmDelete.value = false;
    if (!current) return;
    let cancelled = false;
    /** @returns {Promise<ToPayDraft>} */
    const load = async () => {
      if (current.id) {
        const toPay = await toPays.get(current.id);
        if (toPay.automationId) {
          const automation = await automations.find(toPay.automationId);
          if (!cancelled) madeBy.value = { id: toPay.automationId, name: automation?.name ?? null };
        }
        const currency = accounts.byId.peek().get(toPay.accountId)?.currency ?? 'EUR';
        return {
          kind: toPay.kind,
          amount: toDecimalString(toPay.amountMinor, currency),
          categoryId: toPay.categoryId ?? '',
          accountId: toPay.accountId,
          toAccountId: toPay.toAccountId ?? '',
          date: '',
          payee: toPay.payee,
          note: toPay.note,
          dueDate: toPay.dueDate ?? '',
        };
      }
      const defaults = await transactions.defaults();
      return {
        kind: 'expense',
        amount: '',
        categoryId: '',
        accountId: defaults.accountId ?? '',
        toAccountId: '',
        date: '',
        payee: '',
        note: '',
        dueDate: '',
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
  const title = editingId ? t('toPay.edit') : t('toPay.add');

  /** @param {ToPayDraft} draft */
  const save = async (draft) => {
    if (editingId) await toPays.edit(editingId, toInput(draft));
    else await toPays.create(toInput(draft));
    toasts.show('toast.toPaySaved');
    onClose();
  };

  /** @param {ToPayDraft} draft */
  const pay = async (draft) => {
    if (!editingId) return;
    await toPays.edit(editingId, toInput(draft));
    if (await actions.pay(editingId)) onClose();
  };

  const remove = async () => {
    confirmDelete.value = false;
    if (editingId && (await actions.remove(editingId))) onClose();
  };

  // Close first so the next page never opens under this dialog.
  const addAccount = () => {
    onClose();
    router.navigate('/accounts/new');
  };

  /** @param {string} id */
  const openAutomation = (id) => {
    onClose();
    router.navigate(`/automations/${encodeURIComponent(id)}`);
  };

  return (
    <>
      <Dialog open={open && !confirmDelete.value} title={title} onClose={onClose}>
        {loadError.value && <InlineMessage tone="error">{loadError.value}</InlineMessage>}
        {!loadError.value && needsAccount && (
          <InlineMessage
            action={
              <Button variant="primary" onClick={addAccount}>
                {t('accounts.add')}
              </Button>
            }
          >
            {t('toPay.needAccount')}
          </InlineMessage>
        )}
        {initial.value && madeBy.value?.name && (
          <InlineMessage
            action={
              <Button onClick={() => openAutomation(/** @type {MadeBy} */ (madeBy.value).id)}>
                {t('toPay.openAutomation')}
              </Button>
            }
          >
            {t('toPay.madeBy', { name: madeBy.value.name })}
          </InlineMessage>
        )}
        {initial.value && madeBy.value && madeBy.value.name === null && (
          <InlineMessage>{t('toPay.madeByDeleted')}</InlineMessage>
        )}
        {initial.value && (activeAccounts.length > 0 || editingId) && (
          <ToPayForm
            initial={initial.value}
            accounts={activeAccounts}
            categories={categories.active.value}
            payeeSuggestions={payeeSuggestions.value}
            onSubmit={save}
            onCancel={onClose}
            onPay={editingId ? pay : undefined}
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
        title={t('toPay.delete')}
        message={madeBy.value ? t('toPay.deleteAutomaticConfirm') : t('toPay.deleteConfirm')}
        confirmLabel={t('toPay.delete')}
        danger
        onConfirm={() => void remove()}
        onCancel={() => {
          confirmDelete.value = false;
        }}
      />
    </>
  );
}
