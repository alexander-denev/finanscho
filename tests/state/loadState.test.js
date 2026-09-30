import { describe, expect, it } from 'vitest';
import { createLoadState } from '../../src/state/loadState.js';

/**
 * @template T
 * @returns {{ promise: Promise<T>, resolve: (value: T) => void, reject: (error: unknown) => void }}
 */
function deferred() {
  /** @type {(value: T) => void} */
  let resolve = () => {};
  /** @type {(error: unknown) => void} */
  let reject = () => {};
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise: /** @type {Promise<T>} */ (promise), resolve, reject };
}

describe('createLoadState', () => {
  it('tracks status and error and drops results of superseded runs', async () => {
    const state = createLoadState();
    /** @type {string[]} */
    const applied = [];
    const slow = deferred();
    const fast = deferred();
    const first = state.run(
      () => slow.promise,
      (v) => applied.push(String(v)),
    );
    const second = state.run(
      () => fast.promise,
      (v) => applied.push(String(v)),
    );
    expect(state.status.value).toBe('loading');
    fast.resolve('new');
    await second;
    slow.resolve('old');
    await first;
    expect(applied).toEqual(['new']);
    expect(state.status.value).toBe('idle');

    const failing = deferred();
    const run = state.run(
      () => failing.promise,
      () => {},
    );
    failing.reject(new Error('boom'));
    await run;
    expect(state.status.value).toBe('error');
    expect(state.error.value).toBeInstanceOf(Error);
    await state.run(
      async () => 1,
      () => {},
    );
    expect(state.error.value).toBeNull();
  });

  it('settles after chained runs', async () => {
    const state = createLoadState();
    const later = deferred();
    void state.run(
      () => later.promise,
      () => {},
    );
    const settled = state.settled();
    void state.run(
      async () => 'x',
      () => {},
    );
    later.resolve('y');
    await settled;
    expect(state.status.value).toBe('idle');
  });
});
