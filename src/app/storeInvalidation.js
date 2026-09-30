/** @typedef {import('../core/ports/changeFeed.js').ChangeFeed} ChangeFeed */
/** @typedef {import('../core/ports/changeFeed.js').ChangedEntity} ChangedEntity */

/**
 * @typedef {object} InvalidationBinding
 * @property {{ invalidate: () => Promise<void> }} store
 * @property {ReadonlyArray<ChangedEntity>} dependsOn
 */

/**
 * Subscribes each store to the entity types it depends on. Local writes and applied remote ops
 * both arrive through the change feed, so stores never know about sync.
 * @param {ChangeFeed} feed
 * @param {InvalidationBinding[]} bindings
 * @returns {() => void} unsubscribe
 */
export function bindStoreInvalidation(feed, bindings) {
  return feed.subscribe((event) => {
    for (const { store, dependsOn } of bindings) {
      if (event.entities.some((entity) => dependsOn.includes(entity))) void store.invalidate();
    }
  });
}
