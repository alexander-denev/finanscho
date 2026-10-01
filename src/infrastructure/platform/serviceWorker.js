/**
 * Service worker registration with silent, guarded updates (docs/DECISIONS.md, D36).
 *
 * A new version is applied with `updateSW(true)` (activate the waiting worker, then reload) without
 * asking, but only when that cannot discard the user's work: no `<dialog>` is open and no sync
 * cycle is running, or the page is hidden. Otherwise the update waits for the next
 * `visibilitychange`, dialog `close`, or "no longer busy" signal.
 *
 * The page reloads itself when the new worker takes control. vite-plugin-pwa only reloads when the
 * page was already controlled at registration time, which is not the case on the first visit
 * (the worker claims the page later), and an old page must never keep running against new caches.
 */

/** How often to look for a new version while the page is visible. */
export const UPDATE_CHECK_MS = 60 * 60_000;

/**
 * The subset of `virtual:pwa-register`'s `registerSW` used here.
 * @typedef {(options: {
 *   immediate?: boolean,
 *   onNeedRefresh?: () => void,
 *   onOfflineReady?: () => void,
 *   onRegisteredSW?: (swUrl: string, registration: ServiceWorkerRegistration | undefined) => void,
 *   onRegisterError?: (error: unknown) => void,
 * }) => (reloadPage?: boolean) => Promise<void>} RegisterSw
 */

/**
 * @typedef {object} ServiceWorkerDeps
 * @property {RegisterSw} register `registerSW` from `virtual:pwa-register`
 * @property {Document} document
 * @property {() => boolean} isBusy true while reloading could lose work (open form, running sync)
 * @property {(listener: () => void) => () => void} onBusyChange notifies when `isBusy` may have changed
 * @property {() => void} onOfflineReady called once, when the app is first cached for offline use
 * @property {Pick<ServiceWorkerContainer, 'addEventListener' | 'removeEventListener'>} [serviceWorker] defaults to `navigator.serviceWorker`
 * @property {() => void} [reload] defaults to `location.reload()`
 * @property {(error: unknown) => void} [reportError] defaults to `globalThis.reportError` (logs, never throws)
 * @property {() => boolean} [isOnline]
 * @property {Pick<typeof globalThis, 'setInterval' | 'clearInterval'>} [timers]
 */

/**
 * Registers the service worker and applies updates silently when it is safe.
 * @param {ServiceWorkerDeps} deps
 * @returns {() => void} stops listening and checking for updates
 */
export function startServiceWorker({
  register,
  document,
  isBusy,
  onBusyChange,
  onOfflineReady,
  serviceWorker = globalThis.navigator?.serviceWorker,
  reload = () => globalThis.location.reload(),
  reportError = (error) => globalThis.reportError?.(error),
  isOnline = () => globalThis.navigator?.onLine !== false,
  timers = globalThis,
}) {
  let updateReady = false;
  let applying = false;
  /** @type {ReturnType<typeof setInterval> | undefined} */
  let interval;

  const isSafe = () => document.visibilityState === 'hidden' || !isBusy();
  const reloadOnce = () => reload();

  const applyIfSafe = () => {
    if (!updateReady || applying || !isSafe()) return;
    applying = true;
    serviceWorker?.addEventListener('controllerchange', reloadOnce, { once: true });
    updateSW(true).catch((error) => {
      applying = false;
      serviceWorker?.removeEventListener('controllerchange', reloadOnce);
      reportError(error);
    });
  };

  const updateSW = register({
    immediate: true,
    onNeedRefresh() {
      updateReady = true;
      applyIfSafe();
    },
    onOfflineReady,
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      interval = timers.setInterval(() => {
        if (document.visibilityState !== 'visible' || registration.installing || !isOnline()) {
          return;
        }
        registration.update().catch(() => {
          // Offline or the server is unreachable; the next check tries again.
        });
      }, UPDATE_CHECK_MS);
    },
    onRegisterError: reportError,
  });

  // `close` does not bubble, so listen in the capture phase to see every dialog closing.
  document.addEventListener('visibilitychange', applyIfSafe);
  document.addEventListener('close', applyIfSafe, true);
  const offBusy = onBusyChange(applyIfSafe);

  return () => {
    document.removeEventListener('visibilitychange', applyIfSafe);
    document.removeEventListener('close', applyIfSafe, true);
    offBusy();
    serviceWorker?.removeEventListener('controllerchange', reloadOnce);
    if (interval !== undefined) timers.clearInterval(interval);
  };
}
