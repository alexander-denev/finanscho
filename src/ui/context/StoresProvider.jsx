import { createContext } from 'preact';
import { useContext } from 'preact/hooks';

/**
 * Every store the UI can use. Built by `app/createContainer.js`.
 * @typedef {object} Stores
 * @property {import('../../state/AccountsStore.js').AccountsStore} accounts
 * @property {import('../../state/CategoriesStore.js').CategoriesStore} categories
 * @property {import('../../state/TransactionsStore.js').TransactionsStore} transactions
 * @property {import('../../state/BudgetsStore.js').BudgetsStore} budgets
 * @property {import('../../state/AutomationsStore.js').AutomationsStore} automations
 * @property {import('../../state/DashboardStore.js').DashboardStore} dashboard
 * @property {import('../../state/SettingsStore.js').SettingsStore} settings
 * @property {import('../../state/SyncStore.js').SyncStore} sync
 * @property {import('../../state/ToastStore.js').ToastStore} toasts
 * @property {import('../../state/InstallStore.js').InstallStore} install
 * @property {import('../router/historyRouter.js').HistoryRouter} router
 * @property {{ today: () => string, nowMs: () => number }} clock read-only clock for defaults and relative times
 */

const StoresContext = createContext(/** @type {Stores | null} */ (null));

/**
 * @typedef {object} StoresProviderProps
 * @property {Stores} stores
 * @property {import('preact').ComponentChildren} children
 */

/**
 * Makes the stores available to page components via `useStores()`.
 * @param {StoresProviderProps} props
 * @returns {import('preact').JSX.Element}
 */
export function StoresProvider({ stores, children }) {
  return <StoresContext.Provider value={stores}>{children}</StoresContext.Provider>;
}

/**
 * Returns the stores. Only page components and app-level shells call this; generic components in
 * `ui/components` receive data through props.
 * @returns {Stores}
 */
export function useStores() {
  const stores = useContext(StoresContext);
  if (!stores) throw new Error('useStores() must be used inside <StoresProvider>');
  return stores;
}
