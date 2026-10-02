import { signal } from '@preact/signals';

/**
 * @template T
 * @typedef {import('@preact/signals').ReadonlySignal<T>} ReadonlySignal
 */

/**
 * @typedef {object} Route
 * @property {string} path path pattern such as '/accounts' or '/transactions/:id'
 */

/**
 * @typedef {object} RouteMatch
 * @property {string} path the matched pattern
 * @property {Record<string, string>} params
 */

/**
 * @typedef {object} HistoryRouter
 * @property {ReadonlySignal<string>} currentPath the URL path, e.g. '/transactions'
 * @property {(path: string) => void} navigate
 * @property {() => void} dispose
 */

/**
 * Normalizes a URL path: '' becomes '/', '/x/' becomes '/x'.
 * @param {string} pathname
 * @returns {string}
 */
export function normalizePath(pathname) {
  return `/${pathname.replace(/^\/+|\/+$/g, '')}`;
}

/**
 * Matches a path against route patterns; `:name` segments capture parameters.
 * @template {Route} R
 * @param {readonly R[]} routes
 * @param {string} path
 * @returns {{ route: R, params: Record<string, string> } | null}
 */
export function matchRoute(routes, path) {
  const parts = path.split('/').filter(Boolean);
  for (const route of routes) {
    const pattern = route.path.split('/').filter(Boolean);
    if (pattern.length !== parts.length) continue;
    /** @type {Record<string, string>} */
    const params = {};
    let ok = true;
    for (let i = 0; i < pattern.length; i += 1) {
      if (pattern[i].startsWith(':')) params[pattern[i].slice(1)] = decodeURIComponent(parts[i]);
      else if (pattern[i] !== parts[i]) ok = false;
    }
    if (ok) return { route, params };
  }
  return null;
}

/**
 * The same-origin path a click on a plain link should navigate to in place, or null when the
 * browser should handle it (modifier keys, other buttons, `target`, `download`, other origins).
 * @param {MouseEvent} event
 * @param {Location} location
 * @returns {string | null}
 */
function inAppPath(event, location) {
  if (event.defaultPrevented || event.button !== 0) return null;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const target = /** @type {Element | null} */ (event.target);
  const link = target?.closest?.('a[href]');
  if (!link || !(link instanceof HTMLAnchorElement)) return null;
  if ((link.target && link.target !== '_self') || link.hasAttribute('download')) return null;
  const url = new URL(link.href, location.href);
  if (url.origin !== location.origin) return null;
  return url.pathname;
}

/**
 * Creates a router on the History API, bound to a window. Plain same-origin link clicks navigate
 * in place, and links saved from the old hash router (`#/transactions`) are rewritten to their
 * path. The composition root owns the instance.
 * @param {Pick<Window, 'location' | 'history' | 'addEventListener' | 'removeEventListener'>} win
 * @returns {HistoryRouter}
 */
export function createHistoryRouter(win) {
  if (win.location.hash.startsWith('#/')) {
    win.history.replaceState(null, '', win.location.hash.slice(1).split('?')[0]);
  }
  const currentPath = signal(normalizePath(win.location.pathname));
  const onPopState = () => {
    currentPath.value = normalizePath(win.location.pathname);
  };
  /** @param {string} path */
  const navigate = (path) => {
    if (normalizePath(path) !== normalizePath(win.location.pathname)) {
      win.history.pushState(null, '', path);
    }
    currentPath.value = normalizePath(path);
  };
  /** @param {MouseEvent} event */
  const onClick = (event) => {
    const path = inAppPath(event, win.location);
    if (path === null) return;
    event.preventDefault();
    navigate(path);
  };
  win.addEventListener('popstate', onPopState);
  win.addEventListener('click', onClick);
  return {
    currentPath,
    navigate,
    dispose() {
      win.removeEventListener('popstate', onPopState);
      win.removeEventListener('click', onClick);
    },
  };
}
