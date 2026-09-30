import { useRef } from 'preact/hooks';
import { useSignal } from '@preact/signals';
import { yearMonthOf } from '../../../core/domain/localDate.js';
import { debounce } from '../../../shared/debounce.js';
import { Button } from '../../components/Button.jsx';
import { MonthPicker } from '../../components/MonthPicker.jsx';
import { Select } from '../../components/Select.jsx';
import { TextField } from '../../components/TextField.jsx';
import { t } from '../../i18n/i18n.js';
import styles from './TransactionFilters.module.css';

/** @typedef {import('../../../state/TransactionsStore.js').TransactionFilter} TransactionFilter */

/**
 * @typedef {object} TransactionFiltersProps
 * @property {TransactionFilter} filter
 * @property {(changes: Partial<TransactionFilter>) => void} onChange
 * @property {() => void} onClear
 * @property {readonly { id: string, name: string }[]} accounts
 * @property {readonly { id: string, name: string }[]} categories
 * @property {string} today
 */

const SEARCH_DELAY_MS = 250;

/**
 * Account, category, month, and text filters for the transaction list.
 * @param {TransactionFiltersProps} props
 * @returns {import('preact').JSX.Element}
 */
export function TransactionFilters({ filter, onChange, onClear, accounts, categories, today }) {
  const search = useSignal(filter.search);
  // Keep the latest callback so the debouncer, created once per mount, never calls a stale one.
  const latestOnChange = useRef(onChange);
  latestOnChange.current = onChange;
  const debouncer = useRef(
    /** @type {import('../../../shared/debounce.js').Debounced | null} */ (null),
  );
  debouncer.current ??= debounce(
    () => latestOnChange.current({ search: search.peek() }),
    SEARCH_DELAY_MS,
  );
  const pushSearch = debouncer.current;
  const active = Boolean(filter.accountId || filter.categoryId || filter.month || filter.search);

  return (
    <section className={styles.root} aria-label={t('transactions.filters')}>
      <div className={styles.grid}>
        <Select
          label={t('transactions.filterAccount')}
          value={filter.accountId ?? ''}
          options={[
            { value: '', label: t('transactions.allAccounts') },
            ...accounts.map((a) => ({ value: a.id, label: a.name })),
          ]}
          onChange={(value) => onChange({ accountId: value || null })}
        />
        <Select
          label={t('transactions.filterCategory')}
          value={filter.categoryId ?? ''}
          options={[
            { value: '', label: t('transactions.allCategories') },
            ...categories.map((c) => ({ value: c.id, label: c.name })),
          ]}
          onChange={(value) => onChange({ categoryId: value || null })}
        />
        <TextField
          label={t('transactions.search')}
          type="search"
          value={search.value}
          onInput={(value) => {
            search.value = value;
            pushSearch.trigger();
          }}
        />
      </div>
      <div className={styles.row}>
        <MonthPicker
          label={t('transactions.filterMonth')}
          value={filter.month}
          fallback={yearMonthOf(today)}
          allLabel={t('transactions.allMonths')}
          onChange={(month) => onChange({ month })}
        />
        {active && (
          <Button
            variant="ghost"
            onClick={() => {
              search.value = '';
              pushSearch.cancel();
              onClear();
            }}
          >
            {t('transactions.clearFilters')}
          </Button>
        )}
      </div>
    </section>
  );
}
