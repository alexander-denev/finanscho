import { DashboardPage } from '../ui/features/dashboard/DashboardPage.jsx';
import { TransactionsPage } from '../ui/features/transactions/TransactionsPage.jsx';
import { BudgetsPage } from '../ui/features/budgets/BudgetsPage.jsx';
import { AccountsPage } from '../ui/features/accounts/AccountsPage.jsx';
import { RecurringPage } from '../ui/features/recurring/RecurringPage.jsx';
import { CategoriesPage } from '../ui/features/categories/CategoriesPage.jsx';
import { SettingsPage } from '../ui/features/settings/SettingsPage.jsx';
import { MorePage } from '../ui/features/navigation/MorePage.jsx';

/**
 * Route table: hash path → page component.
 * @type {ReadonlyArray<import('../ui/router/RouterView.jsx').PageRoute>}
 */
export const ROUTES = [
  { path: '/', component: DashboardPage },
  { path: '/transactions', component: TransactionsPage },
  { path: '/budgets', component: BudgetsPage },
  { path: '/accounts', component: AccountsPage },
  { path: '/accounts/new', component: AccountsPage },
  { path: '/recurring', component: RecurringPage },
  { path: '/categories', component: CategoriesPage },
  { path: '/settings', component: SettingsPage },
  { path: '/more', component: MorePage },
];
