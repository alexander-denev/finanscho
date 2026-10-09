import { randomUuid } from '../shared/randomUuid.js';

/** ID generator port backed by `crypto.randomUUID()` (or its fallback outside secure contexts). */
export class UuidGenerator {
  /** @returns {string} */
  newId() {
    return randomUuid();
  }
}
