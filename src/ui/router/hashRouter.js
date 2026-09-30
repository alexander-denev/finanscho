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
 * @typedef {object} HashRouter
 * @property {ReadonlySignal<string>} currentPath the path after `#`, e.g. '/transactions'
 * @property {(path: string) => void} navigate
 * @property {() => void} dispose
 */

/**
 * Normalizes a location hash to a path: '' and '#' become '/', '#/x/' becomes '/x'.
 * @param {string} hash
 * @returns {string}
 */
export function pathFromHash(hash) {
  const raw = hash.replace(/^#/, '').split('?')[0] ?? '';
  const path = `/${raw.replace(/^\/+|\/+$/g, '')}`;
  return path;
}

/**
 * Builds an href for a path.
 * @param {string} path
 * @returns {string}
 */
export function hrefFor(path) {
  return `#${path}`;
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
 * Creates a hash router bound to a window. The composition root owns the instance.
 * @param {Pick<Window, 'location' | 'addEventListener' | 'removeEventListener'>} win
 * @returns {HashRouter}
 */
export function createHashRouter(win) {
  const currentPath = signal(pathFromHash(win.location.hash));
  const onChange = () => {
    currentPath.value = pathFromHash(win.location.hash);
  };
  win.addEventListener('hashchange', onChange);
  return {
    currentPath,
    navigate(path) {
      win.location.hash = hrefFor(path);
      onChange();
    },
    dispose() {
      win.removeEventListener('hashchange', onChange);
    },
  };
}
