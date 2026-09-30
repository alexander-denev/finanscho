import { localDateFromDate } from '../core/domain/localDate.js';

/** Clock port backed by the system clock. */
export class SystemClock {
  /** @returns {number} */
  nowMs() {
    return Date.now();
  }

  /** @returns {string} */
  nowIso() {
    return new Date().toISOString();
  }

  /** @returns {string} the local calendar date */
  today() {
    return localDateFromDate(new Date());
  }
}
