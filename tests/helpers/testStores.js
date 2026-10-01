import { AccountsStore } from '../../src/state/AccountsStore.js';
import { CategoriesStore } from '../../src/state/CategoriesStore.js';
import { TransactionsStore } from '../../src/state/TransactionsStore.js';
import { BudgetsStore } from '../../src/state/BudgetsStore.js';
import { RecurringStore } from '../../src/state/RecurringStore.js';
import { DashboardStore } from '../../src/state/DashboardStore.js';
import { SettingsStore } from '../../src/state/SettingsStore.js';
import { SyncStore } from '../../src/state/SyncStore.js';
import { ToastStore } from '../../src/state/ToastStore.js';
import { InstallStore } from '../../src/state/InstallStore.js';
import { bindStoreInvalidation } from '../../src/app/storeInvalidation.js';
import { SyncError } from '../../src/core/errors.js';
import { createTestServices } from './testServices.js';
import { FakeInstallEnvironment } from './FakeInstallEnvironment.js';

/** @typedef {import('../../src/core/ports/syncTransport.js').SyncStatus} SyncStatus */

/**
 * A SyncControl stand-in that records calls.
 * @returns {import('../../src/core/ports/syncTransport.js').SyncControl & {
 *   calls: string[],
 *   emit: (s: Partial<SyncStatus>) => void,
 *   setDevices: (list: import('../../src/core/ports/syncTransport.js').DeviceInfo[]) => void,
 *   refuseRemovals: (refuse: boolean) => void,
 * }}
 */
export function createFakeSyncControl() {
  /** @type {SyncStatus} */
  let status = {
    state: 'disabled',
    reason: null,
    lastSyncedAt: null,
    deferredOps: 0,
    issues: 0,
    cleanupBlocked: false,
  };
  /** @type {Set<(s: SyncStatus) => void>} */
  const listeners = new Set();
  /** @type {import('../../src/core/ports/credentialStore.js').WebDavCredentials | null} */
  let config = null;
  /** @type {string[]} */
  const calls = [];
  /** @type {import('../../src/core/ports/syncTransport.js').DeviceInfo[]} */
  let devices = [];
  let refuseRemoval = false;
  return {
    calls,
    emit(changes) {
      status = { ...status, ...changes };
      for (const l of listeners) l(status);
    },
    getStatus: () => status,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async syncNow() {
      calls.push('syncNow');
    },
    async getConfig() {
      return config;
    },
    async configure(c) {
      calls.push(c ? 'configure' : 'clear');
      config = c;
    },
    async testConnection(c) {
      calls.push('test');
      return c.password === 'right' ? { ok: true } : { ok: false, reason: 'auth' };
    },
    listDevices: () => devices,
    async removeDevice(deviceId) {
      calls.push(`remove:${deviceId}`);
      if (refuseRemoval) throw new SyncError('removeIncomplete');
      devices = devices.filter((d) => d.deviceId !== deviceId);
      for (const l of listeners) l(status);
    },
    async compactNow() {
      calls.push('compactNow');
    },
    /** @param {import('../../src/core/ports/syncTransport.js').DeviceInfo[]} list */
    setDevices(list) {
      devices = list;
      for (const l of listeners) l(status);
    },
    /** @param {boolean} refuse */
    refuseRemovals(refuse) {
      refuseRemoval = refuse;
    },
  };
}

/**
 * Real services on fake-indexeddb, real stores, and change-feed invalidation — the same wiring as
 * the composition root, minus sync. `installEnvironment` is a controllable fake.
 * @param {Parameters<typeof createTestServices>[0] & { installEnvironment?: FakeInstallEnvironment }} [options]
 */
export async function createTestStores(options = {}) {
  const t = await createTestServices(options);
  await t.services.categories.seedDefaults();
  const installEnvironment = options.installEnvironment ?? new FakeInstallEnvironment();
  const accounts = new AccountsStore({ accountService: t.services.accounts });
  const transactions = new TransactionsStore({
    transactionService: t.services.transactions,
    accountsStore: accounts,
  });
  const stores = {
    accounts,
    categories: new CategoriesStore({ categoryService: t.services.categories }),
    transactions,
    budgets: new BudgetsStore({ budgetService: t.services.budgets, clock: t.clock }),
    recurring: new RecurringStore({ recurringService: t.services.recurring }),
    dashboard: new DashboardStore({ dashboardService: t.services.dashboard }),
    settings: new SettingsStore({
      settingsService: t.services.settings,
      backupService: t.services.backup,
    }),
    sync: new SyncStore({ syncControl: createFakeSyncControl() }),
    toasts: new ToastStore(),
    install: new InstallStore({
      environment: installEnvironment,
      settingsService: t.services.settings,
      accountsStore: accounts,
      transactionsStore: transactions,
      clock: t.clock,
    }),
  };
  const unbind = bindStoreInvalidation(t.feed, [
    { store: stores.accounts, dependsOn: AccountsStore.DEPENDS_ON },
    { store: stores.categories, dependsOn: CategoriesStore.DEPENDS_ON },
    { store: stores.transactions, dependsOn: TransactionsStore.DEPENDS_ON },
    { store: stores.budgets, dependsOn: BudgetsStore.DEPENDS_ON },
    { store: stores.recurring, dependsOn: RecurringStore.DEPENDS_ON },
    { store: stores.dashboard, dependsOn: DashboardStore.DEPENDS_ON },
  ]);
  await Promise.all([
    stores.accounts.load(),
    stores.categories.load(),
    stores.transactions.load(),
    stores.budgets.load(),
    stores.recurring.load(),
    stores.dashboard.load(),
    stores.settings.load(),
    stores.sync.load(),
    stores.install.load(),
  ]);
  /** Waits for every store's pending reloads. */
  const settled = () =>
    Promise.all([
      stores.accounts.settled(),
      stores.categories.settled(),
      stores.transactions.settled(),
      stores.budgets.settled(),
      stores.recurring.settled(),
      stores.dashboard.settled(),
      stores.settings.settled(),
      stores.install.settled(),
    ]);
  return { ...t, stores, settled, unbind, installEnvironment };
}
