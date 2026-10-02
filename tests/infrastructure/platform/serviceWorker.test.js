// @vitest-environment happy-dom
// The update guard listens to document visibility and dialog close events.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  startServiceWorker,
  UPDATE_CHECK_MS,
} from '../../../src/infrastructure/platform/serviceWorker.js';

/** @param {'visible' | 'hidden'} state */
function setVisibility(state) {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

/**
 * Starts the module with a fake `registerSW` and returns handles to drive it.
 * @param {{ busy?: boolean }} [options]
 */
function setup({ busy = false } = {}) {
  /** @type {Parameters<import('../../../src/infrastructure/platform/serviceWorker.js').RegisterSw>[0]} */
  let options = {};
  const updateSW = vi.fn(async (/** @type {boolean | undefined} */ _reload) => {});
  /** @type {Set<() => void>} */
  const busyListeners = new Set();
  const state = { busy };
  const reportError = vi.fn();
  const serviceWorker = new EventTarget();
  const reload = vi.fn();
  const stop = startServiceWorker({
    register: (o) => {
      options = o;
      return updateSW;
    },
    document,
    isBusy: () => state.busy,
    onBusyChange: (listener) => {
      busyListeners.add(listener);
      return () => busyListeners.delete(listener);
    },
    serviceWorker,
    reload,
    reportError,
    isOnline: () => true,
  });
  return {
    options: () => options,
    updateSW,
    reportError,
    stop,
    state,
    serviceWorker,
    reload,
    /** @param {boolean} value */
    setBusy(value) {
      state.busy = value;
      for (const listener of busyListeners) listener();
    },
  };
}

afterEach(() => {
  setVisibility('visible');
  vi.useRealTimers();
});

describe('startServiceWorker', () => {
  it('registers immediately and forwards registration errors', () => {
    const sw = setup();
    expect(sw.options().immediate).toBe(true);
    const error = new Error('blocked');
    sw.options().onRegisterError?.(error);
    expect(sw.reportError).toHaveBeenCalledWith(error);
    sw.stop();
  });

  it('applies an update at once, with a reload, when nothing is in progress', () => {
    const sw = setup();
    sw.options().onNeedRefresh?.();
    expect(sw.updateSW).toHaveBeenCalledTimes(1);
    expect(sw.updateSW).toHaveBeenCalledWith(true);
    sw.stop();
  });

  it('reloads once the new worker takes control, even when the plugin would not', () => {
    const sw = setup();
    sw.serviceWorker.dispatchEvent(new Event('controllerchange'));
    expect(sw.reload).not.toHaveBeenCalled();
    sw.options().onNeedRefresh?.();
    sw.serviceWorker.dispatchEvent(new Event('controllerchange'));
    sw.serviceWorker.dispatchEvent(new Event('controllerchange'));
    expect(sw.reload).toHaveBeenCalledTimes(1);
    sw.stop();
  });

  it('waits while busy and applies when the busy state clears', () => {
    const sw = setup({ busy: true });
    sw.options().onNeedRefresh?.();
    expect(sw.updateSW).not.toHaveBeenCalled();
    sw.setBusy(false);
    expect(sw.updateSW).toHaveBeenCalledTimes(1);
    sw.setBusy(false);
    expect(sw.updateSW).toHaveBeenCalledTimes(1);
    sw.stop();
  });

  it('re-checks when a dialog closes', () => {
    const sw = setup({ busy: true });
    sw.options().onNeedRefresh?.();
    const dialog = document.createElement('dialog');
    document.body.append(dialog);
    dialog.dispatchEvent(new Event('close'));
    expect(sw.updateSW).not.toHaveBeenCalled();
    // The form closed; nothing else signals, so only the non-bubbling `close` event can trigger.
    sw.state.busy = false;
    dialog.dispatchEvent(new Event('close'));
    expect(sw.updateSW).toHaveBeenCalledTimes(1);
    dialog.remove();
    sw.stop();
  });

  it('applies while busy once the page is hidden, because nothing visible can be lost', () => {
    const sw = setup({ busy: true });
    sw.options().onNeedRefresh?.();
    setVisibility('hidden');
    expect(sw.updateSW).toHaveBeenCalledTimes(1);
    sw.stop();
  });

  it('never applies without a waiting update, and stops listening after stop()', () => {
    const sw = setup({ busy: true });
    setVisibility('hidden');
    expect(sw.updateSW).not.toHaveBeenCalled();
    setVisibility('visible');
    sw.stop();
    sw.options().onNeedRefresh?.();
    expect(sw.updateSW).not.toHaveBeenCalled();
    sw.setBusy(false);
    setVisibility('hidden');
    expect(sw.updateSW).not.toHaveBeenCalled();
  });

  it('allows a retry when applying the update fails', async () => {
    const sw = setup();
    sw.updateSW.mockRejectedValueOnce(new Error('activation failed'));
    sw.options().onNeedRefresh?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(sw.reportError).toHaveBeenCalledTimes(1);
    sw.setBusy(false);
    expect(sw.updateSW).toHaveBeenCalledTimes(2);
    sw.stop();
  });

  it('checks for a new version hourly, only while visible', () => {
    vi.useFakeTimers();
    const sw = setup();
    const registration = /** @type {ServiceWorkerRegistration} */ (
      /** @type {unknown} */ ({ installing: null, update: vi.fn(async () => {}) })
    );
    sw.options().onRegisteredSW?.('sw.js', registration);
    vi.advanceTimersByTime(UPDATE_CHECK_MS);
    expect(registration.update).toHaveBeenCalledTimes(1);
    setVisibility('hidden');
    vi.advanceTimersByTime(UPDATE_CHECK_MS);
    expect(registration.update).toHaveBeenCalledTimes(1);
    setVisibility('visible');
    sw.stop();
    vi.advanceTimersByTime(UPDATE_CHECK_MS);
    expect(registration.update).toHaveBeenCalledTimes(1);
  });
});
