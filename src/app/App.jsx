import { useSignal, useSignalEffect } from '@preact/signals';
import { StoresProvider } from '../ui/context/StoresProvider.jsx';
import { RouterView } from '../ui/router/RouterView.jsx';
import { NotFoundPage } from '../ui/features/navigation/NotFoundPage.jsx';
import { TransactionDialog } from '../ui/features/transactions/TransactionDialog.jsx';
import { AppShell } from './AppShell.jsx';
import { ROUTES } from './routes.js';

/**
 * @typedef {object} AppProps
 * @property {import('../ui/context/StoresProvider.jsx').Stores} stores
 */

/**
 * Root component: provides the stores, applies the theme, and renders the shell, the page for the
 * current route, and the global "Add transaction" dialog.
 * @param {AppProps} props
 * @returns {import('preact').JSX.Element}
 */
export function App({ stores }) {
  const addRequest = useSignal(/** @type {{ id: string | null } | null} */ (null));

  // DOM integration: reflect the theme preference on <html data-theme>.
  useSignalEffect(() => {
    const theme = stores.settings.values.value.theme;
    const root = document.documentElement;
    if (theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = theme;
  });

  return (
    <StoresProvider stores={stores}>
      <AppShell
        onAddTransaction={() => {
          addRequest.value = { id: null };
        }}
      >
        <RouterView router={stores.router} routes={ROUTES} notFound={NotFoundPage} />
      </AppShell>
      <TransactionDialog
        request={addRequest}
        onClose={() => {
          addRequest.value = null;
        }}
      />
    </StoresProvider>
  );
}
