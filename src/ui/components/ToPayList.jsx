import { daysLeft, dueTone } from '../../core/domain/toPay.js';
import { formatDate, t } from '../i18n/i18n.js';
import { Amount } from './Amount.jsx';
import { Button } from './Button.jsx';
import { ItemIcon } from './ItemIcon.jsx';
import styles from './ToPayList.module.css';

/** @typedef {import('./toPayListItem.js').ToPayListItem} ToPayListItem */

/**
 * @typedef {object} ToPayListProps
 * @property {readonly ToPayListItem[]} items
 * @property {string} [label] the list's accessible name
 * @property {string} today 'YYYY-MM-DD', for the days left
 * @property {(id: string) => void} onSelect opens the To pay
 * @property {(id: string) => void} onPay
 * @property {(id: string) => void} onDelete
 * @property {boolean} [disabled] while a pay or delete is running
 */

/**
 * How the due date reads: the date and the days left, yellow on the day itself, red after it.
 * @param {string | null} dueDate
 * @param {string} today
 * @returns {{ text: string, tone: 'ahead' | 'today' | 'overdue' } | null}
 */
function dueText(dueDate, today) {
  const days = daysLeft(dueDate, today);
  const tone = dueTone(dueDate, today);
  if (dueDate === null || days === null || tone === 'none') return null;
  const left =
    days === 0
      ? t('toPay.due.today')
      : days === 1
        ? t('toPay.due.day')
        : days > 1
          ? t('toPay.due.days', { count: days })
          : days === -1
            ? t('toPay.due.overdueDay')
            : t('toPay.due.overdueDays', { count: -days });
  return {
    text: `${t('toPay.due.date', { date: formatDate(dueDate, 'medium') })} · ${left}`,
    tone,
  };
}

/**
 * To pays as rows: tapping the row opens it; Pay and Delete sit beside it. The due text says in
 * words what its color shows.
 * @param {ToPayListProps} props
 * @returns {import('preact').JSX.Element}
 */
export function ToPayList({ items, label, today, onSelect, onPay, onDelete, disabled = false }) {
  return (
    <ul className={styles.list} aria-label={label}>
      {items.map((item) => {
        const due = dueText(item.dueDate, today);
        return (
          <li key={item.id} className={styles.row}>
            <button type="button" className={styles.main} onClick={() => onSelect(item.id)}>
              <ItemIcon icon={item.icon} color={item.color} />
              <span className={styles.text}>
                <span className={styles.title}>{item.title}</span>
                <span className={styles.details}>
                  {item.details}
                  {item.automatic && (
                    <span className={styles.badge}>{t('toPay.automaticBadge')}</span>
                  )}
                </span>
                {due && <span className={`${styles.due} ${styles[due.tone]}`}>{due.text}</span>}
              </span>
              <Amount minor={item.minor} currency={item.currency} kind={item.kind} />
            </button>
            <span className={styles.actions}>
              <Button
                variant="primary"
                disabled={disabled}
                aria-label={t('toPay.payLabel', { title: item.title })}
                onClick={() => onPay(item.id)}
              >
                {t('toPay.pay')}
              </Button>
              <Button
                variant="ghost"
                icon="trash"
                disabled={disabled}
                aria-label={t('toPay.deleteLabel', { title: item.title })}
                onClick={() => onDelete(item.id)}
              />
            </span>
          </li>
        );
      })}
    </ul>
  );
}
