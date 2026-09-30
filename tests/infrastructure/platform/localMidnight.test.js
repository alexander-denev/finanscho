import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onLocalMidnight } from '../../../src/infrastructure/platform/localMidnight.js';

describe('onLocalMidnight', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 4, 15, 23, 59, 0));
  });
  afterEach(() => vi.useRealTimers());

  it('fires just after each local midnight until cancelled', async () => {
    const listener = vi.fn();
    const cancel = onLocalMidnight(listener);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(listener).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(listener).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(24 * 3_600_000);
    expect(listener).toHaveBeenCalledTimes(2);
    cancel();
    await vi.advanceTimersByTimeAsync(48 * 3_600_000);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
