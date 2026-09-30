import { addDays } from '../../src/core/domain/localDate.js';

/** Controllable Clock for tests. `today()` is the UTC date of the current instant. */
export class FixedClock {
  #ms;

  /** @param {string} [iso] */
  constructor(iso = '2024-05-15T10:00:00.000Z') {
    this.#ms = Date.parse(iso);
  }

  /** @returns {number} */
  nowMs() {
    return this.#ms;
  }

  /** @returns {string} */
  nowIso() {
    return new Date(this.#ms).toISOString();
  }

  /** @returns {string} */
  today() {
    return this.nowIso().slice(0, 10);
  }

  /** @param {number} ms */
  advance(ms) {
    this.#ms += ms;
  }

  /** @param {number} days */
  advanceDays(days) {
    this.#ms = Date.parse(`${addDays(this.today(), days)}T${this.nowIso().slice(11)}`);
  }

  /** @param {string} iso */
  set(iso) {
    this.#ms = Date.parse(iso);
  }
}
