import { matchRoute } from './hashRouter.js';

/**
 * @typedef {object} PageRoute
 * @property {string} path
 * @property {import('preact').ComponentType<{ params: Record<string, string> }>} component
 */

/**
 * @typedef {object} RouterViewProps
 * @property {import('./hashRouter.js').HashRouter} router
 * @property {readonly PageRoute[]} routes
 * @property {import('preact').ComponentType<Record<string, never>>} notFound
 */

/**
 * Renders the page for the current hash path.
 * @param {RouterViewProps} props
 * @returns {import('preact').JSX.Element}
 */
export function RouterView({ router, routes, notFound: NotFound }) {
  const match = matchRoute(routes, router.currentPath.value);
  if (!match) return <NotFound />;
  const Page = match.route.component;
  return <Page params={match.params} />;
}
