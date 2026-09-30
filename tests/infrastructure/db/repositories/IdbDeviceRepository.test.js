import { describe, expect, it } from 'vitest';
import { IdbDeviceRepository } from '../../../../src/infrastructure/db/repositories/IdbDeviceRepository.js';
import { createTestDb } from '../../../helpers/testDb.js';
import { SequentialIds } from '../../../helpers/SequentialIds.js';

describe('IdbDeviceRepository', () => {
  it('creates the device id once and stores the device name', async () => {
    const { db } = await createTestDb();
    const ids = new SequentialIds('dev');
    const repo = new IdbDeviceRepository({ db, newId: () => ids.newId() });
    const [a, b] = await Promise.all([repo.getDeviceId(), repo.getDeviceId()]);
    expect(a).toBe('dev-1');
    expect(b).toBe('dev-1');
    expect(await repo.getDeviceName()).toBe('');
    await repo.setDeviceName('Laptop');
    expect(await repo.getDeviceName()).toBe('Laptop');
  });
});
