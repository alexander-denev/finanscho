import { describe, expect, it } from 'vitest';
import {
  createHashRouter,
  hrefFor,
  matchRoute,
  pathFromHash,
} from '../../../src/ui/router/hashRouter.js';

describe('hashRouter', () => {
  it('normalizes hashes to paths', () => {
    expect(pathFromHash('')).toBe('/');
    expect(pathFromHash('#')).toBe('/');
    expect(pathFromHash('#/transactions/')).toBe('/transactions');
    expect(pathFromHash('#/budgets?x=1')).toBe('/budgets');
    expect(hrefFor('/accounts')).toBe('#/accounts');
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

  it('tracks the window hash in a signal', async () => {
    window.location.hash = '#/budgets';
    const router = createHashRouter(window);
    expect(router.currentPath.value).toBe('/budgets');
    router.navigate('/accounts');
    expect(router.currentPath.value).toBe('/accounts');
    window.location.hash = '#/settings';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(router.currentPath.value).toBe('/settings');
    router.dispose();
  });
});
