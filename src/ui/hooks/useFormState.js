import { useSignal } from '@preact/signals';
import { ValidationError } from '../../core/errors.js';
import { errorMessage } from '../i18n/i18n.js';

/**
 * @template T
 * @typedef {object} FormState
 * @property {import('@preact/signals').Signal<T>} draft local form draft
 * @property {import('@preact/signals').Signal<Record<string, string>>} errors field → i18n key
 * @property {import('@preact/signals').Signal<string | null>} formError message for non-field errors
 * @property {import('@preact/signals').Signal<boolean>} busy
 * @property {(patch: Partial<T>) => void} update
 * @property {(action: (draft: T) => Promise<unknown>) => Promise<boolean>} submit runs the action; returns whether it succeeded
 */

/**
 * Local form state: a draft signal, typed validation errors shown inline, and a busy flag.
 * @template {object} T
 * @param {T} initial
 * @returns {FormState<T>}
 */
export function useFormState(initial) {
  const draft = useSignal(initial);
  const errors = useSignal(/** @type {Record<string, string>} */ ({}));
  const formError = useSignal(/** @type {string | null} */ (null));
  const busy = useSignal(false);
  return {
    draft,
    errors,
    formError,
    busy,
    update(patch) {
      draft.value = { ...draft.value, ...patch };
    },
    async submit(action) {
      busy.value = true;
      errors.value = {};
      formError.value = null;
      try {
        await action(draft.value);
        return true;
      } catch (error) {
        if (error instanceof ValidationError) errors.value = error.fields;
        else formError.value = errorMessage(error);
        return false;
      } finally {
        busy.value = false;
      }
    },
  };
}
