/** Deterministic IdGenerator for tests: `<prefix>-1`, `<prefix>-2`, … */
export class SequentialIds {
  #prefix;
  #next = 1;

  /** @param {string} [prefix] */
  constructor(prefix = 'id') {
    this.#prefix = prefix;
  }

  /** @returns {string} */
  newId() {
    const id = `${this.#prefix}-${this.#next}`;
    this.#next += 1;
    return id;
  }
}
