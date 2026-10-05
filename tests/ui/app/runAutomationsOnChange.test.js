import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runAutomationsOnChange } from '../../../src/app/runAutomationsOnChange.js';
import { ChangeFeed } from '../../../src/shared/ChangeFeed.js';

describe('runAutomationsOnChange', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs once shortly after local transaction changes, and never for pulled ones', async () => {
    const feed = new ChangeFeed();
    const run = vi.fn(() => Promise.resolve(0));
    const stop = runAutomationsOnChange(feed, run, { waitMs: 100 });
    feed.publish({ entities: ['transactions'], source: 'local' });
    feed.publish({ entities: ['transactions', 'accounts'], source: 'local' });
    feed.publish({ entities: ['transactions'], source: 'remote' });
    feed.publish({ entities: ['budgets'], source: 'local' });
    await vi.advanceTimersByTimeAsync(99);
    expect(run).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(1);

    feed.publish({ entities: ['transactions'], source: 'local' });
    stop();
    await vi.advanceTimersByTimeAsync(200);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('swallows a failed run; the next change runs again', async () => {
    const feed = new ChangeFeed();
    const run = vi.fn(() => Promise.reject(new Error('locked')));
    runAutomationsOnChange(feed, run, { waitMs: 10 });
    feed.publish({ entities: ['transactions'], source: 'local' });
    await vi.advanceTimersByTimeAsync(10);
    feed.publish({ entities: ['transactions'], source: 'local' });
    await vi.advanceTimersByTimeAsync(10);
    expect(run).toHaveBeenCalledTimes(2);
  });
});
