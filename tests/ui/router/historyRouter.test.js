import { afterEach, describe, expect, it } from 'vitest';
import {
  createHistoryRouter,
  matchRoute,
  normalizePath,
} from '../../../src/ui/router/historyRouter.js';

/**
 * Appends a link and clicks it, returning whether the router took over the navigation.
 * @param {string} href
 * @param {MouseEventInit & { target?: string }} [options]
 */
function clickLink(href, { target, ...init } = {}) {
  const link = document.createElement('a');
  link.href = href;
  if (target) link.target = target;
  link.textContent = 'link';
  document.body.append(link);
  let handled = false;
  // Runs after the router's listener: record its choice, then stop happy-dom from navigating.
  /** @param {Event} event */
  const record = (event) => {
    handled = event.defaultPrevented;
    event.preventDefault();
  };
  window.addEventListener('click', record);
  link.dispatchEvent(
    new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init }),
  );
  window.removeEventListener('click', record);
  link.remove();
  return handled;
}

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('historyRouter', () => {
  it('normalizes paths', () => {
    expect(normalizePath('')).toBe('/');
    expect(normalizePath('/')).toBe('/');
    expect(normalizePath('/transactions/')).toBe('/transactions');
  });

  it('matches routes with parameters', () => {
    const routes = [{ path: '/' }, { path: '/accounts' }, { path: '/accounts/:id' }];
    expect(matchRoute(routes, '/')?.route.path).toBe('/');
    expect(matchRoute(routes, '/accounts/a%20b')).toEqual({
      route: routes[2],
      params: { id: 'a b' },
    });
    expect(matchRoute(routes, '/nope')).toBeNull();
  });

  it('tracks the URL path in a signal, including back and forward', () => {
    window.history.replaceState(null, '', '/budgets');
    const router = createHistoryRouter(window);
    expect(router.currentPath.value).toBe('/budgets');
    router.navigate('/accounts');
    expect(router.currentPath.value).toBe('/accounts');
    expect(window.location.pathname).toBe('/accounts');
    window.history.replaceState(null, '', '/settings');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(router.currentPath.value).toBe('/settings');
    router.dispose();
  });

  it('rewrites links saved from the hash router to their path', () => {
    window.history.replaceState(null, '', '/#/transactions?x=1');
    const router = createHistoryRouter(window);
    expect(router.currentPath.value).toBe('/transactions');
    expect(window.location.hash).toBe('');
    router.dispose();
  });

  it('navigates plain same-origin link clicks in place and leaves the rest to the browser', () => {
    const router = createHistoryRouter(window);
    expect(clickLink('/categories')).toBe(true);
    expect(router.currentPath.value).toBe('/categories');
    expect(clickLink('/settings', { ctrlKey: true })).toBe(false);
    expect(clickLink('/settings', { target: '_blank' })).toBe(false);
    expect(clickLink('https://example.com/settings')).toBe(false);
    expect(router.currentPath.value).toBe('/categories');
    router.dispose();
    expect(clickLink('/budgets')).toBe(false);
  });
});
