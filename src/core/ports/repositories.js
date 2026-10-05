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
 * @property {(id: string, updatedAt: string) => Promise<void>} remove
 * @property {() => Promise<Account[]>} listDeleted deleted accounts that still carry all their fields (not yet shrunk to stubs)
 */

/**
 * @typedef {object} CategoryRepository
 * @property {(options?: { kind?: CategoryKind, includeArchived?: boolean }) => Promise<Category[]>} list sorted by name
 * @property {(id: string) => Promise<Category | null>} get
 * @property {(category: Category) => Promise<void>} create
 * @property {(id: string, changes: Partial<Category>) => Promise<void>} update
 * @property {(categories: Category[]) => Promise<number>} seed writes absent records with the minimum clock; returns how many were written
 * @property {(id: string, updatedAt: string) => Promise<void>} remove
 * @property {() => Promise<Category[]>} listDeleted deleted categories that still carry all their fields (not yet shrunk to stubs)
 */

/**
 * Filter for a transaction list query. `limit` bounds the result; `hasMore` reports whether more
 * matching transactions exist.
 * @typedef {object} TransactionQuery
 * @property {string} [accountId] matches either side of a transfer
 * @property {string} [categoryId]
 * @property {boolean} [uncategorized] only income and expenses without a category
 * @property {YearMonth} [month]
 * @property {string} [search] case-insensitive match on payee and note
 * @property {number} limit
 */

/**
 * The most recent use of a payee, for suggestions and autofill.
 * @typedef {object} PayeeSuggestion
 * @property {string} payee as last written
 * @property {import('../domain/transaction.js').TransactionKind} kind
 * @property {string | null} categoryId
 * @property {string} accountId
 */

/**
 * @typedef {object} TransactionRepository
 * @property {(id: string) => Promise<Transaction | null>} get
 * @property {(query: TransactionQuery) => Promise<{ items: Transaction[], hasMore: boolean }>} query newest first
 * @property {(from: LocalDate, to: LocalDate) => Promise<Transaction[]>} listInRange inclusive; use only for bounded ranges (a month)
 * @property {(accountId: string, through?: LocalDate) => Promise<number>} netForAccount signed sum of all effects on the account; with `through`, only of transactions dated on or before that day
 * @property {(accountId: string) => Promise<boolean>} hasAnyForAccount whether a visible transaction uses the account on either side
 * @property {(categoryId: string) => Promise<boolean>} hasAnyForCategory whether a visible transaction uses the category
 * @property {(limit: number) => Promise<PayeeSuggestion[]>} recentPayees distinct payees (case-insensitive), most recently used first, from a bounded scan of recent transactions
 * @property {(transaction: Transaction) => Promise<void>} create
 * @property {(id: string, changes: Partial<Transaction>) => Promise<void>} update
 * @property {(id: string, updatedAt: string) => Promise<void>} remove
 * @property {(categoryId: string, month: YearMonth) => Promise<Transaction[]>} listForCategoryInMonth uses the [categoryId+date] index
 * @property {(ruleId: string) => Promise<Set<string>>} occurrenceIdsForRule IDs of the rule's occurrences in any state (including deleted and tombstone stubs)
 * @property {(ruleId: string, occurrences: Transaction[]) => Promise<number>} materialize writes occurrences whose IDs do not exist in any state, with the rule's creation clock; returns how many were written
 */

/**
 * The newest budget record of a category up to some month, in any state. `budget` is null when
 * that record is deleted (or not fully created yet).
 * @typedef {{ month: YearMonth, budget: Budget | null }} LatestBudget
 */

/**
 * @typedef {object} BudgetRepository
 * @property {(month: YearMonth) => Promise<Budget[]>} listByMonth
 * @property {(id: string) => Promise<Budget | null>} get
 * @property {(budget: Budget) => Promise<void>} put creates or replaces all fields (deterministic id)
 * @property {(id: string, updatedAt: string) => Promise<void>} remove
 * @property {(throughMonth: YearMonth) => Promise<Map<string, LatestBudget>>} latestPerCategory by category ID, including deleted records
 * @property {(sourceId: string, months: YearMonth[]) => Promise<number>} copyRecurring copies a visible recurring budget into `months` (ascending) with the source's clock, stopping at the first month that has a record in any state; returns how many were written
 */

/**
 * @typedef {object} RecurringRuleRepository
 * @property {() => Promise<RecurringRule[]>} list
 * @property {(id: string) => Promise<RecurringRule | null>} get
 * @property {(rule: RecurringRule) => Promise<void>} create
 * @property {(id: string, endDate: LocalDate | null, updatedAt: string) => Promise<void>} setEndDate
 * @property {(id: string, endDate: LocalDate | null, skippedOccurrenceIds: string[], updatedAt: string) => Promise<void>} reopen in one transaction: deletes the skipped occurrences that don't exist yet (so no device creates them), then sets the end date
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
