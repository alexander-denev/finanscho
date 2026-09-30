/**
 * @typedef {'accounts' | 'categories' | 'transactions' | 'budgets' | 'recurringRules'} ChangedEntity
 * @typedef {{ entities: ChangedEntity[], source: 'local' | 'remote' }} ChangeEvent
 */

const EVENT_TYPE = 'change';

/**
 * EventTarget-based implementation of the `changeFeed` port (see core/ports/changeFeed.js).
 * Listeners must handle their own errors (stores catch failures inside `invalidate()`).
 */
export class ChangeFeed {
  #target = new EventTarget();

  /**
   * @param {ChangeEvent} event
   * @returns {void}
   */
  publish(event) {
    if (event.entities.length === 0) return;
    const detail = { ...event, entities: [...new Set(event.entities)] };
    this.#target.dispatchEvent(new CustomEvent(EVENT_TYPE, { detail }));
  }

  /**
   * @param {(event: ChangeEvent) => void} listener
   * @returns {() => void} unsubscribe
   */
  subscribe(listener) {
    /** @param {Event} event */
    const handler = (event) => {
      listener(/** @type {CustomEvent<ChangeEvent>} */ (event).detail);
    };
    this.#target.addEventListener(EVENT_TYPE, handler);
    return () => this.#target.removeEventListener(EVENT_TYPE, handler);
  }
}
