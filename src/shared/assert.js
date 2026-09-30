/**
 * Throws when a condition is false. Use for programmer errors (broken invariants),
 * not for validating user input — services throw typed errors from core/errors.js for that.
 * @param {unknown} condition
 * @param {string} message
 * @returns {asserts condition}
 */
export function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}
