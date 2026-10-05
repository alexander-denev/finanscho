import { IdbAccountRepository } from '../../src/infrastructure/db/repositories/IdbAccountRepository.js';
import { IdbCategoryRepository } from '../../src/infrastructure/db/repositories/IdbCategoryRepository.js';
import { IdbTransactionRepository } from '../../src/infrastructure/db/repositories/IdbTransactionRepository.js';
import { IdbBudgetRepository } from '../../src/infrastructure/db/repositories/IdbBudgetRepository.js';
import { IdbAutomationRepository } from '../../src/infrastructure/db/repositories/IdbAutomationRepository.js';
import { IdbSettingsRepository } from '../../src/infrastructure/db/repositories/IdbSettingsRepository.js';
import { IdbDeviceRepository } from '../../src/infrastructure/db/repositories/IdbDeviceRepository.js';
import { IdbBackupRepository } from '../../src/infrastructure/db/repositories/IdbBackupRepository.js';
import { AccountService } from '../../src/core/services/AccountService.js';
import { CategoryService } from '../../src/core/services/CategoryService.js';
import { TransactionService } from '../../src/core/services/TransactionService.js';
import { BudgetService } from '../../src/core/services/BudgetService.js';
import { AutomationService } from '../../src/core/services/AutomationService.js';
import { DashboardService } from '../../src/core/services/DashboardService.js';
import { BackupService } from '../../src/core/services/BackupService.js';
import { SettingsService } from '../../src/core/services/SettingsService.js';
import { createTestDb } from './testDb.js';
import { SequentialIds } from './SequentialIds.js';

/**
 * Wires real IndexedDB repositories (fake-indexeddb) and core services for tests.
 * @param {Parameters<typeof createTestDb>[0] & { idPrefix?: string }} [options]
 */
export async function createTestServices(options = {}) {
  const env = await createTestDb(options);
  const { db, recorder, clock } = env;
  const ids = new SequentialIds(options.idPrefix ?? 'id');
  const repos = {
    accounts: new IdbAccountRepository({ db, recorder }),
    categories: new IdbCategoryRepository({ db, recorder }),
    transactions: new IdbTransactionRepository({ db, recorder }),
    budgets: new IdbBudgetRepository({ db, recorder }),
    automations: new IdbAutomationRepository({ db, recorder }),
    settings: new IdbSettingsRepository({ db }),
    device: new IdbDeviceRepository({ db, newId: () => ids.newId() }),
    backup: new IdbBackupRepository({ db, recorder }),
  };
  const accounts = new AccountService({ ...repos, clock, ids });
  const categories = new CategoryService({ ...repos, clock, ids });
  const transactions = new TransactionService({ ...repos, clock, ids });
  const budgets = new BudgetService({ ...repos, clock });
  const automations = new AutomationService({ ...repos, clock, ids });
  const dashboard = new DashboardService({
    accounts,
    budgets,
    automations,
    transactions: repos.transactions,
    clock,
  });
  const backup = new BackupService({ backup: repos.backup, clock });
  const settings = new SettingsService({ settings: repos.settings, device: repos.device, clock });
  return {
    ...env,
    ids,
    repos,
    services: {
      accounts,
      categories,
      transactions,
      budgets,
      automations,
      dashboard,
      backup,
      settings,
    },
  };
}

/**
 * Creates an EUR checking account with the given opening balance.
 * @param {Awaited<ReturnType<typeof createTestServices>>} t
 * @param {string} [name]
 * @param {string} [openingBalance]
 * @param {string} [currency]
 */
export function makeAccount(t, name = 'Checking', openingBalance = '0', currency = 'EUR') {
  return t.services.accounts.create({ name, type: 'checking', currency, openingBalance });
}
