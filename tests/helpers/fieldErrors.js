import { ValidationError } from '../../src/core/errors.js';

/**
 * Runs `fn`, expecting it to throw a ValidationError, and returns the field errors.
 * @param {() => unknown} fn
 * @returns {Record<string, string>}
 */
export function fieldErrors(fn) {
  try {
    fn();
  } catch (error) {
    if (error instanceof ValidationError) return error.fields;
    throw error;
  }
  throw new Error('Expected a ValidationError');
}

/**
 * Awaits `promise`, expecting it to reject with a ValidationError, and returns the field errors.
 * @param {Promise<unknown>} promise
 * @returns {Promise<Record<string, string>>}
 */
export async function asyncFieldErrors(promise) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ValidationError) return error.fields;
    throw error;
  }
  throw new Error('Expected a ValidationError');
}
