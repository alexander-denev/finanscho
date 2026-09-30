/**
 * Small seeded PRNG (mulberry32) for reproducible property-style tests without extra packages.
 * @param {number} seed
 * @returns {{ next: () => number, int: (max: number) => number, pick: <T>(items: T[]) => T, shuffle: <T>(items: T[]) => T[] }}
 */
export function createRandom(seed) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (/** @type {number} */ max) => Math.floor(next() * max);
  return {
    next,
    int,
    pick: (items) => items[int(items.length)],
    shuffle: (items) => {
      const copy = [...items];
      for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = int(i + 1);
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    },
  };
}
