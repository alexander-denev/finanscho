/**
 * Composition root: the only module that knows every layer. It creates infrastructure, injects it
 * into services, builds the stores, and wires change-feed invalidation, sync, and timers.
 */

import { openDatabase } from '../infrastructure/db/database.js';
import { ChangeRecorder } from '../infrastructure/db/ChangeRecorder.js';
import { IdbAccountRepository } from '../infrastructure/db/repositories/IdbAccountRepository.js';
import { IdbCategoryRepository } from '../infrastructure/db/repositories/IdbCategoryRepository.js';
import { IdbTransactionRepository } from '../infrastructure/db/repositories/IdbTransactionRepository.js';
import { IdbBudgetRepository } from '../infrastructure/db/repositories/IdbBudgetRepository.js';
import { IdbRecurringRuleRepository } from '../infrastructure/db/repositories/IdbRecurringRuleRepository.js';
import { IdbSettingsRepository } from '../infrastructure/db/repositories/IdbSettingsRepository.js';
import { IdbDeviceRepository } from '../infrastructure/db/repositories/IdbDeviceRepository.js';
import { IdbBackupRepository } from '../infrastructure/db/repositories/IdbBackupRepository.js';
import { IdbCredentialStore } from '../infrastructure/db/IdbCredentialStore.js';
import { SyncEngine } from '../infrastructure/sync/SyncEngine.js';
import { SyncScheduler } from '../infrastructure/sync/SyncScheduler.js';
import { WebDavClient } from '../infrastructure/sync/webdav/WebDavClient.js';
import { FetchHttpAdapter } from '../infrastructure/sync/webdav/FetchHttpAdapter.js';
import { NativeHttpAdapter } from '../infrastructure/sync/webdav/NativeHttpAdapter.js';
import { getPlatformName } from '../infrastructure/platform/platform.js';
import { onAppPause, onAppResume } from '../infrastructure/platform/lifecycle.js';
import { onLocalMidnight } from '../infrastructure/platform/localMidnight.js';
import { SystemClock } from '../infrastructure/SystemClock.js';
import { UuidGenerator } from '../infrastructure/UuidGenerator.js';
import { ChangeFeed } from '../shared/ChangeFeed.js';
import { AccountService } from '../core/services/AccountService.js';
import { CategoryService } from '../core/services/CategoryService.js';
import { TransactionService } from '../core/services/TransactionService.js';
import { BudgetService } from '../core/services/BudgetService.js';
import { RecurringService } from '../core/services/RecurringService.js';
import { DashboardService } from '../core/services/DashboardService.js';
import { BackupService } from '../core/services/BackupService.js';
import { SettingsService } from '../core/services/SettingsService.js';
import { AccountsStore } from '../state/AccountsStore.js';
import { CategoriesStore } from '../state/CategoriesStore.js';
import { TransactionsStore } from '../state/TransactionsStore.js';
import { BudgetsStore } from '../state/BudgetsStore.js';
import { RecurringStore } from '../state/RecurringStore.js';
import { DashboardStore } from '../state/DashboardStore.js';
import { SettingsStore } from '../state/SettingsStore.js';
import { SyncStore } from '../state/SyncStore.js';
import { ToastStore } from '../state/ToastStore.js';
import { createHashRouter } from '../ui/router/hashRouter.js';
import { t } from '../ui/i18n/i18n.js';
import { bindStoreInvalidation } from './storeInvalidation.js';

/**
 * @typedef {object} Container
 * @property {import('../ui/context/StoresProvider.jsx').Stores} stores
 * @property {() => void} dispose
 */

/**
 * Asks the browser to keep IndexedDB data under storage pressure, where supported.
 * @returns {Promise<boolean | null>} null when the API is unavailable
 */
async function requestPersistentStorage() {
  const storage = globalThis.navigator?.storage;
  if (!storage || typeof storage.persist !== 'function') return null;
  try {
    return (await storage.persisted()) || (await storage.persist());
  } catch {
    return null;
  }
}

/**
 * Builds the whole application.
 * @param {{ window: Window }} env
 * @returns {Promise<Container>}
 */
export async function createContainer({ window }) {
  const platform = getPlatformName();
  const db = await openDatabase();
  const clock = new SystemClock();
  const ids = new UuidGenerator();
  const newId = () => ids.newId();
  const changeFeed = new ChangeFeed();

  const device = new IdbDeviceRepository({ db, newId });
  const deviceId = await device.getDeviceId();
  if ((await device.getDeviceName()) === '') {
    await device.setDeviceName(t(`settings.defaultDeviceName.${platform}`));
  }
  const recorder = new ChangeRecorder({ db, deviceId, nowMs: () => clock.nowMs(), changeFeed });

  const repos = {
    accounts: new IdbAccountRepository({ db, recorder }),
    categories: new IdbCategoryRepository({ db, recorder }),
    transactions: new IdbTransactionRepository({ db, recorder }),
    budgets: new IdbBudgetRepository({ db, recorder }),
    rules: new IdbRecurringRuleRepository({ db, recorder }),
    settings: new IdbSettingsRepository({ db }),
  };

  const accountService = new AccountService({ ...repos, clock, ids });
  const categoryService = new CategoryService({ ...repos, clock, ids });
  const transactionService = new TransactionService({ ...repos, clock, ids });
  const budgetService = new BudgetService({ ...repos, clock });
  const recurringService = new RecurringService({ ...repos, clock, ids });
  const dashboardService = new DashboardService({
    accounts: accountService,
    budgets: budgetService,
    recurring: recurringService,
    transactions: repos.transactions,
    clock,
  });
  const backupService = new BackupService({
    backup: new IdbBackupRepository({ db, recorder }),
    clock,
  });
  const settingsService = new SettingsService({ settings: repos.settings, device });

  // Startup data work: replay ops deferred by an older version, seed defaults, catch up recurring.
  await recorder.replayDeferred();
  await categoryService.seedDefaults();
  await recurringService.materialize();

  // Sync. iOS uses native HTTP; Android and the web use fetch (see docs/DECISIONS.md, D19).
  const http = platform === 'ios' ? new NativeHttpAdapter({ platform }) : new FetchHttpAdapter();
  /**
   * @param {import('../core/ports/credentialStore.js').WebDavCredentials} credentials
   * @returns {WebDavClient}
   */
  const createClient = (credentials) => new WebDavClient({ http, credentials });
  const scheduler = new SyncScheduler({
    credentials: new IdbCredentialStore({ db }),
    settings: repos.settings,
    changeFeed,
    createClient,
    createEngine: (credentials) =>
      new SyncEngine({
        db,
        recorder,
        transport: createClient(credentials),
        deviceId,
        getDeviceName: () => device.getDeviceName(),
        afterPull: async () => {
          await recurringService.materialize();
        },
        changeFeed,
        nowIso: () => clock.nowIso(),
      }),
    onVaultChange: () => recorder.republishAll(),
    lifecycle: { onResume: onAppResume, onPause: onAppPause },
    nowIso: () => clock.nowIso(),
  });

  const accounts = new AccountsStore({ accountService });
  const stores = {
    accounts,
    categories: new CategoriesStore({ categoryService }),
    transactions: new TransactionsStore({ transactionService, accountsStore: accounts }),
    budgets: new BudgetsStore({ budgetService, clock }),
    recurring: new RecurringStore({ recurringService }),
    dashboard: new DashboardStore({ dashboardService }),
    settings: new SettingsStore({ settingsService, backupService }),
    sync: new SyncStore({ syncControl: scheduler }),
    toasts: new ToastStore(),
    router: createHashRouter(window),
    clock: { today: () => clock.today(), nowMs: () => clock.nowMs() },
  };

  const unbind = bindStoreInvalidation(changeFeed, [
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
  ]);

  const cancelMidnight = onLocalMidnight(() => {
    void stores.recurring.materialize();
    void stores.budgets.invalidate();
    void stores.dashboard.invalidate();
  });
  void requestPersistentStorage().then((persisted) =>
    stores.settings.setStoragePersisted(persisted),
  );
  // Sync starts in the background so the UI never waits for the network.
  void scheduler.start();

  return {
    stores,
    dispose() {
      scheduler.stop();
      cancelMidnight();
      unbind();
      stores.sync.dispose();
      stores.router.dispose();
      db.close();
    },
  };
}
