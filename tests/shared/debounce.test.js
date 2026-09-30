import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { debounce } from '../../src/shared/debounce.js';

describe('debounce', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('calls once after the last trigger', () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d.trigger();
    vi.advanceTimersByTime(50);
    d.trigger();
    vi.advanceTimersByTime(99);
    expect(fn).not.toHaveBeenCalled();
    expect(d.isPending()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(d.isPending()).toBe(false);
  });

  it('can be cancelled', () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d.trigger();
    d.cancel();
    vi.advanceTimersByTime(200);
    expect(fn).not.toHaveBeenCalled();
  });
});
