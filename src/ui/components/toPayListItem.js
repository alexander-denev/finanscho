import { t } from '../i18n/i18n.js';

/** @typedef {import('../../core/domain/toPay.js').ToPay} ToPay */
/** @typedef {import('./Icon.jsx').IconName} IconName */

/**
 * A To pay as a list row shows it.
 * @typedef {object} ToPayListItem
 * @property {string} id
 * @property {string} title
 * @property {string} details
 * @property {IconName} icon
 * @property {string | null} color
 * @property {number} minor
 * @property {string} currency
 * @property {'income' | 'expense' | 'transfer'} kind
 * @property {string | null} dueDate
 * @property {boolean} automatic
 */

/**
 * @typedef {object} ToPayLookups
 * @property {ReadonlyMap<string, { name: string, currency: string }>} accounts
 * @property {ReadonlyMap<string, { name: string, icon: IconName, color: string }>} categories
 */

/**
 * Describes a To pay for `ToPayList`, the way a transaction row describes a transaction: payee (or
 * category, or transfer target) as the title, category and account below, and a gray icon for
 * transfers and uncategorized entries.
 * @param {ToPay} toPay
 * @param {ToPayLookups} lookups
 * @returns {ToPayListItem}
 */
export function toPayListItem(toPay, { accounts, categories }) {
  const isTransfer = toPay.kind === 'transfer';
  const category = toPay.categoryId ? categories.get(toPay.categoryId) : undefined;
  const account = accounts.get(toPay.accountId);
  const accountName = account?.name ?? '';
  const toAccountName = toPay.toAccountId ? (accounts.get(toPay.toAccountId)?.name ?? '') : '';
  const title =
    toPay.payee ||
    (isTransfer ? t('transactions.transferTo', { account: toAccountName }) : category?.name) ||
    t(`kind.${toPay.kind}`);
  const details = [
    isTransfer
      ? `${accountName} → ${toAccountName}`
      : [category?.name ?? t('transactions.uncategorized'), accountName]
          .filter(Boolean)
          .join(' · '),
    toPay.note,
  ]
    .filter(Boolean)
    .join(' — ');
  /** @type {{ icon: IconName, color: string | null }} */
  const look = isTransfer
    ? { icon: 'transfer', color: null }
    : category
      ? { icon: category.icon, color: category.color }
      : { icon: 'help', color: null };
  return {
    id: toPay.id,
    title,
    details,
    ...look,
    minor: toPay.amountMinor,
    currency: account?.currency ?? 'EUR',
    kind: toPay.kind,
    dueDate: toPay.dueDate,
    automatic: Boolean(toPay.automationId),
  };
}
