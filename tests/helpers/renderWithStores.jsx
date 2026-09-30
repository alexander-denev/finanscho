import { render } from '@testing-library/preact';
import { StoresProvider } from '../../src/ui/context/StoresProvider.jsx';
import { createHashRouter } from '../../src/ui/router/hashRouter.js';
import { createTestStores } from './testStores.js';

/**
 * Builds real stores (fake-indexeddb) plus a hash router for UI tests.
 * @param {Parameters<typeof createTestStores>[0] & { path?: string }} [options]
 */
export async function createUiStores(options = {}) {
  window.location.hash = options.path ? `#${options.path}` : '#/';
  const t = await createTestStores(options);
  /** @type {import('../../src/ui/context/StoresProvider.jsx').Stores} */
  const stores = {
    ...t.stores,
    router: createHashRouter(window),
    clock: { today: () => t.clock.today(), nowMs: () => t.clock.nowMs() },
  };
  return { ...t, stores };
}

/**
 * Renders UI inside StoresProvider.
 * @param {import('preact').JSX.Element} ui
 * @param {import('../../src/ui/context/StoresProvider.jsx').Stores} stores
 */
export function renderWithStores(ui, stores) {
  return render(<StoresProvider stores={stores}>{ui}</StoresProvider>);
}
