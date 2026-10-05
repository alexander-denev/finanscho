/**
 * Change feed port: announces committed data changes so that stores can refresh.
 * Local writes (ChangeRecorder) and remote ops (SyncEngine) publish through the same feed.
 */

/**
 * Entity collections that can change.
 * @typedef {'accounts' | 'categories' | 'transactions' | 'budgets' | 'automations'} ChangedEntity
 */

/**
 * @typedef {object} ChangeEvent
 * @property {ChangedEntity[]} entities affected entity types (deduplicated)
 * @property {'local' | 'remote'} source
 */

/**
 * @typedef {object} ChangeFeed
 * @property {(event: ChangeEvent) => void} publish
 * @property {(listener: (event: ChangeEvent) => void) => () => void} subscribe returns an unsubscribe function
 */

export {};
