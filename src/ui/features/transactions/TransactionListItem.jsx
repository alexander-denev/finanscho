import { Amount } from '../../components/Amount.jsx';
import { isAutomatic } from '../../../core/domain/transaction.js';
import { ItemIcon } from '../../components/ItemIcon.jsx';
import { t } from '../../i18n/i18n.js';
import styles from './TransactionListItem.module.css';

/**
 * @typedef {object} TransactionListItemProps
 * @property {import('../../../core/domain/transaction.js').Transaction} transaction
 * @property {{ name: string, color: string, icon: import('../../components/Icon.jsx').IconName } | null} category
 * @property {string} accountName
 * @property {string} toAccountName
 * @property {string} currency
 * @property {(id: string) => void} onSelect
 */

/**
 * The row's icon: transfers show arrows, balance adjustments scales, uncategorized entries a
 * question mark; all three in gray.
 * @param {import('../../../core/domain/transaction.js').Transaction} transaction
 * @param {TransactionListItemProps['category']} category
 * @returns {{ icon: import('../../components/Icon.jsx').IconName, color: string | null }}
 */
function rowIcon(transaction, category) {
  if (transaction.kind === 'transfer') return { icon: 'transfer', color: null };
  if (category) return { icon: category.icon, color: category.color };
  return { icon: transaction.adjustment ? 'scale' : 'help', color: null };
}

/**
 * One ledger row: what it was, where it was booked, and the signed amount on the right.
 * @param {TransactionListItemProps} props
 * @returns {import('preact').JSX.Element}
 */
export function TransactionListItem({
  transaction,
  category,
  accountName,
  toAccountName,
  currency,
  onSelect,
}) {
  const isTransfer = transaction.kind === 'transfer';
  const uncategorizedLabel = transaction.adjustment
    ? t('transactions.adjustment')
    : t('transactions.uncategorized');
  const title =
    transaction.payee ||
    (isTransfer ? t('transactions.transferTo', { account: toAccountName }) : category?.name) ||
    (transaction.adjustment ? t('transactions.adjustment') : t(`kind.${transaction.kind}`));
  const details = [
    isTransfer
      ? `${accountName} → ${toAccountName}`
      : [category?.name ?? uncategorizedLabel, accountName].filter(Boolean).join(' · '),
    transaction.note,
  ].filter(Boolean);

  return (
    <button type="button" className={styles.row} onClick={() => onSelect(transaction.id)}>
      <ItemIcon {...rowIcon(transaction, category)} />
      <span className={styles.text}>
        <span className={styles.title}>{title}</span>
        <span className={styles.details}>
          {details.join(' — ')}
          {isAutomatic(transaction) && (
            <span className={styles.badge}>{t('transactions.automaticBadge')}</span>
          )}
        </span>
      </span>
      <Amount minor={transaction.amountMinor} currency={currency} kind={transaction.kind} />
    </button>
  );
}
