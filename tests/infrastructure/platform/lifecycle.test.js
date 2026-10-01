// @vitest-environment happy-dom
// The web lifecycle path listens to document visibility changes.
import { describe, expect, it, vi } from 'vitest';
import { onAppPause, onAppResume } from '../../../src/infrastructure/platform/lifecycle.js';

/** @param {'visible' | 'hidden'} state */
function setVisibility(state) {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('lifecycle', () => {
  it('maps visibility changes to resume and pause', () => {
    const resume = vi.fn();
    const pause = vi.fn();
    const offResume = onAppResume(resume);
    const offPause = onAppPause(pause);
    setVisibility('hidden');
    setVisibility('visible');
    expect(pause).toHaveBeenCalledTimes(1);
    expect(resume).toHaveBeenCalledTimes(1);
    offResume();
    offPause();
    setVisibility('hidden');
    setVisibility('visible');
    expect(pause).toHaveBeenCalledTimes(1);
    expect(resume).toHaveBeenCalledTimes(1);
  });
});
