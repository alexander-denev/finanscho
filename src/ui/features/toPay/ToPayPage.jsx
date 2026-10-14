import { useComputed, useSignal } from '@preact/signals';
import { useStores } from '../../context/StoresProvider.jsx';
import { ButtonLink } from '../../components/ButtonLink.jsx';
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { ToPayList } from '../../components/ToPayList.jsx';
import { toPayListItem } from '../../components/toPayListItem.js';
import { useToPayActions } from '../../hooks/useToPayActions.js';
import { t } from '../../i18n/i18n.js';
import { ToPayDialog } from './ToPayDialog.jsx';
import styles from './ToPayPage.module.css';

/** The page; `/to-pay/new` opens the add dialog and `/to-pay/<id>` a To pay (linked from elsewhere). */
const TO_PAY_PATH = '/to-pay';
const ADD_PATH = `${TO_PAY_PATH}/new`;

/**
 * Every To pay, soonest due first, with Pay and Delete on each row. On `/to-pay/new` the add dialog
 * opens at once, and on `/to-pay/<id>` that To pay's dialog (the dashboard links there).
 * @returns {import('preact').JSX.Element}
 */
export function ToPayPage() {
  const { toPays, accounts, categories, router, clock } = useStores();
  const actions = useToPayActions();
  const deleting = useSignal(/** @type {{ id: string, automatic: boolean } | null} */ (null));
  const request = useComputed(() => {
    const path = router.currentPath.value;
    if (path === ADD_PATH) return { id: null };
    if (path.startsWith(`${TO_PAY_PATH}/`)) {
      return { id: decodeURIComponent(path.slice(TO_PAY_PATH.length + 1)) };
    }
    return null;
  });

  const lookups = { accounts: accounts.byId.value, categories: categories.byId.value };
  const items = toPays.items.value.map((toPay) => toPayListItem(toPay, lookups));

  const close = () => {
    if (router.currentPath.peek() !== TO_PAY_PATH) router.navigate(TO_PAY_PATH);
  };

  /**
   * @param {string} id
   * @returns {void}
   */
  const open = (id) => router.navigate(`${TO_PAY_PATH}/${encodeURIComponent(id)}`);

  /** @param {string} id */
  const askDelete = (id) => {
    deleting.value = { id, automatic: items.find((item) => item.id === id)?.automatic ?? false };
  };

  const remove = async () => {
    const target = deleting.peek();
    deleting.value = null;
    if (target) await actions.remove(target.id);
  };

  const add = (
    <ButtonLink href={ADD_PATH} variant="primary" icon="plus">
      {t('toPay.add')}
    </ButtonLink>
  );

  return (
    <>
      <PageHeader title={t('toPay.title')} actions={add} />
      {items.length === 0 ? (
        toPays.status.value !== 'loading' && (
          <EmptyState title={t('toPay.empty.title')} body={t('toPay.empty.body')} action={add} />
        )
      ) : (
        <div className={styles.list}>
          <ToPayList
            items={items}
            today={clock.today()}
            disabled={actions.busy.value}
            onSelect={open}
            onPay={(id) => void actions.pay(id)}
            onDelete={askDelete}
          />
        </div>
      )}
      <ToPayDialog request={request} onClose={close} />
      <ConfirmDialog
        open={deleting.value !== null}
        title={t('toPay.delete')}
        message={
          deleting.value?.automatic ? t('toPay.deleteAutomaticConfirm') : t('toPay.deleteConfirm')
        }
        confirmLabel={t('toPay.delete')}
        danger
        onConfirm={() => void remove()}
        onCancel={() => {
          deleting.value = null;
        }}
      />
    </>
  );
}
