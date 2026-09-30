/**
 * Repository contracts that core services depend on. Implementations live in
 * `infrastructure/db/repositories/` and delegate every mutation to ChangeRecorder.
 *
 * All read methods hide tombstoned (deleted) and incomplete records.
 */

/** @typedef {import('../domain/account.js').Account} Account */
/** @typedef {import('../domain/category.js').Category} Category */
/** @typedef {import('../domain/category.js').CategoryKind} CategoryKind */
/** @typedef {import('../domain/transaction.js').Transaction} Transaction */
/** @typedef {import('../domain/budget.js').Budget} Budget */
/** @typedef {import('../domain/recurringRule.js').RecurringRule} RecurringRule */
/** @typedef {import('../domain/localDate.js').LocalDate} LocalDate */
/** @typedef {import('../domain/localDate.js').YearMonth} YearMonth */

/**
 * @typedef {object} AccountRepository
 * @property {(options?: { includeArchived?: boolean }) => Promise<Account[]>} list sorted by name
 * @property {(id: string) => Promise<Account | null>} get
 * @property {(account: Account) => Promise<void>} create
 * @property {(id: string, changes: Partial<Account>) => Promise<void>} update
 */

/**
 * @typedef {object} CategoryRepository
 * @property {(options?: { kind?: CategoryKind, includeArchived?: boolean }) => Promise<Category[]>} list sorted by name
 * @property {(id: string) => Promise<Category | null>} get
 * @property {(category: Category) => Promise<void>} create
 * @property {(id: string, changes: Partial<Category>) => Promise<void>} update
 * @property {(categories: Category[]) => Promise<number>} seed writes absent records with the minimum clock; returns how many were written
 */

/**
 * Filter for a transaction list query. `limit` bounds the result; `hasMore` reports whether more
 * matching transactions exist.
 * @typedef {object} TransactionQuery
 * @property {string} [accountId] matches either side of a transfer
 * @property {string} [categoryId]
 * @property {YearMonth} [month]
 * @property {string} [search] case-insensitive match on payee and note
 * @property {number} limit
 */

/**
 * @typedef {object} TransactionRepository
 * @property {(id: string) => Promise<Transaction | null>} get
 * @property {(query: TransactionQuery) => Promise<{ items: Transaction[], hasMore: boolean }>} query newest first
 * @property {(from: LocalDate, to: LocalDate) => Promise<Transaction[]>} listInRange inclusive; use only for bounded ranges (a month)
 * @property {(accountId: string) => Promise<number>} netForAccount signed sum of all effects on the account
 * @property {(transaction: Transaction) => Promise<void>} create
 * @property {(id: string, changes: Partial<Transaction>) => Promise<void>} update
 * @property {(id: string, updatedAt: string) => Promise<void>} remove
 * @property {(categoryId: string, month: YearMonth) => Promise<Transaction[]>} listForCategoryInMonth uses the [categoryId+date] index
 * @property {(ruleId: string) => Promise<Set<string>>} occurrenceIdsForRule IDs of the rule's occurrences in any state (including deleted)
 * @property {(ruleId: string, occurrences: Transaction[]) => Promise<number>} materialize writes occurrences whose IDs do not exist in any state, with the rule's creation clock; returns how many were written
 */

/**
 * @typedef {object} BudgetRepository
 * @property {(month: YearMonth) => Promise<Budget[]>} listByMonth
 * @property {(id: string) => Promise<Budget | null>} get
 * @property {(budget: Budget) => Promise<void>} put creates or replaces all fields (deterministic id)
 * @property {(id: string, updatedAt: string) => Promise<void>} remove
 */

/**
 * @typedef {object} RecurringRuleRepository
 * @property {() => Promise<RecurringRule[]>} list
 * @property {(id: string) => Promise<RecurringRule | null>} get
 * @property {(rule: RecurringRule) => Promise<void>} create
 * @property {(id: string, endDate: LocalDate | null, updatedAt: string) => Promise<void>} setEndDate
 * @property {(id: string, updatedAt: string) => Promise<void>} remove
 */

/**
 * Device-local key-value settings (not synced).
 * @typedef {object} SettingsRepository
 * @property {(key: string) => Promise<unknown>} get
 * @property {(key: string, value: unknown) => Promise<void>} set
 */

/**
 * Device identity (not synced).
 * @typedef {object} DeviceRepository
 * @property {() => Promise<string>} getDeviceId
 * @property {() => Promise<string>} getDeviceName
 * @property {(name: string) => Promise<void>} setDeviceName
 */

/**
 * A synced record including sync metadata, as exported in backups.
 * @typedef {{ id: string, _clocks: Record<string, string>, [field: string]: unknown }} SyncRecord
 */

/**
 * Full-database access for backup export/import.
 * @typedef {object} BackupRepository
 * @property {() => Promise<Record<string, SyncRecord[]>>} exportAll every record per entity, including tombstones
 * @property {(entities: Record<string, SyncRecord[]>) => Promise<number>} importAll merges records via the normal merge; returns how many records changed
 */

export {};
