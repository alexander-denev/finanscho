import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastStore, TOAST_MS } from '../../src/state/ToastStore.js';

describe('ToastStore', () => {
  afterEach(() => vi.useRealTimers());

  it('shows and auto-dismisses toasts', () => {
    vi.useFakeTimers();
    const toasts = new ToastStore();
    const id = toasts.show('toast.saved', { name: 'x' });
    toasts.show('toast.failed', {}, 'error');
    expect(toasts.toasts.value.map((t) => t.key)).toEqual(['toast.saved', 'toast.failed']);
    toasts.dismiss(id);
    expect(toasts.toasts.value).toHaveLength(1);
    vi.advanceTimersByTime(TOAST_MS);
    expect(toasts.toasts.value).toEqual([]);
  });
});
