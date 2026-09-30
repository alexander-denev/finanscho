import { openDatabase } from '../../src/infrastructure/db/database.js';
import { ChangeRecorder } from '../../src/infrastructure/db/ChangeRecorder.js';
import { ChangeFeed } from '../../src/shared/ChangeFeed.js';
import { FixedClock } from './FixedClock.js';

let counter = 0;

/**
 * Opens a fresh, uniquely named fake-indexeddb database with a ChangeRecorder.
 * @param {{ deviceId?: string, clock?: FixedClock }} [options]
 */
export async function createTestDb(options = {}) {
  counter += 1;
  const db = await openDatabase({ name: `test-${counter}-${Math.random().toString(36).slice(2)}` });
  const clock = options.clock ?? new FixedClock();
  const feed = new ChangeFeed();
  const deviceId = options.deviceId ?? '11111111-1111-4111-8111-111111111111';
  const recorder = new ChangeRecorder({
    db,
    deviceId,
    nowMs: () => clock.nowMs(),
    changeFeed: feed,
  });
  return { db, clock, feed, recorder, deviceId };
}
