/** ID generator port backed by `crypto.randomUUID()`. */
export class UuidGenerator {
  /** @returns {string} */
  newId() {
    return crypto.randomUUID();
  }
}
