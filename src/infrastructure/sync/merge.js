/**
 * Per-field last-writer-wins merge. Pure functions; see docs/SYNC_PROTOCOL.md §2.
 *
 * Each field is a register ordered by `(hlc, canonical JSON of value)`. Taking the maximum per
 * field is commutative, associative, and idempotent, so any delivery order converges.
 */

/**
 * A stored entity record: plain fields plus per-field clocks.
 * @typedef {{ id: string, _clocks: Record<string, string>, [field: string]: unknown }} StoredRecord
 */

/**
 * Minimal op shape needed for merging.
 * @typedef {{ id: string, hlc: string, fields: Record<string, unknown> }} MergeableOp
 */

/**
 * Deterministic JSON serialization with sorted object keys, used to break clock ties.
 * @param {unknown} value
 * @returns {string}
 */
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const obj = /** @type {Record<string, unknown>} */ (value);
    const keys = Object.keys(obj).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/**
 * Whether an incoming `(hlc, value)` beats the stored `(clock, value)` for one field.
 * @param {string} incomingHlc
 * @param {unknown} incomingValue
 * @param {string | undefined} storedHlc
 * @param {unknown} storedValue
 * @returns {boolean}
 */
export function wins(incomingHlc, incomingValue, storedHlc, storedValue) {
  if (storedHlc === undefined || incomingHlc > storedHlc) return true;
  if (incomingHlc < storedHlc) return false;
  return canonicalJson(incomingValue) > canonicalJson(storedValue);
}

/**
 * Deep-copies a JSON-compatible value so stored records never share structure with ops.
 * @template T
 * @param {T} value
 * @returns {T}
 */
function copy(value) {
  return value !== null && typeof value === 'object' ? structuredClone(value) : value;
}

/**
 * Applies an op to a record (or to nothing) and returns the resulting record and whether any
 * field changed. Never mutates its inputs.
 * @param {StoredRecord | undefined} record
 * @param {MergeableOp} op
 * @returns {{ record: StoredRecord, changed: boolean }}
 */
export function applyOp(record, op) {
  /** @type {StoredRecord} */
  const next = record ? { ...record, _clocks: { ...record._clocks } } : { id: op.id, _clocks: {} };
  let changed = record === undefined;
  for (const [field, value] of Object.entries(op.fields)) {
    if (field === 'id' || field === '_clocks') continue;
    if (wins(op.hlc, value, next._clocks[field], next[field])) {
      if (next._clocks[field] !== op.hlc || canonicalJson(next[field]) !== canonicalJson(value)) {
        changed = true;
      }
      next[field] = copy(value);
      next._clocks[field] = op.hlc;
    }
  }
  return { record: next, changed };
}

/**
 * Applies ops in order, starting from a record or nothing.
 * @param {StoredRecord | undefined} record
 * @param {MergeableOp[]} ops
 * @returns {StoredRecord | undefined}
 */
export function applyOps(record, ops) {
  let current = record;
  for (const op of ops) current = applyOp(current, op).record;
  return current;
}

/**
 * Merges two full records of the same id field by field (used for backup import and tests).
 * @param {StoredRecord} a
 * @param {StoredRecord} b
 * @returns {StoredRecord}
 */
export function mergeRecords(a, b) {
  let result = a;
  for (const [field, hlc] of Object.entries(b._clocks)) {
    result = applyOp(result, { id: a.id, hlc, fields: { [field]: b[field] } }).record;
  }
  return result;
}

/**
 * Splits a record into one pseudo-op per distinct clock, so it can be replayed through the normal
 * write path (e.g. when importing a backup).
 * @param {StoredRecord} record
 * @returns {MergeableOp[]}
 */
export function recordToOps(record) {
  /** @type {Map<string, Record<string, unknown>>} */
  const byClock = new Map();
  for (const [field, hlc] of Object.entries(record._clocks)) {
    if (!(field in record)) continue;
    const fields = byClock.get(hlc) ?? {};
    fields[field] = record[field];
    byClock.set(hlc, fields);
  }
  return [...byClock.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([hlc, fields]) => ({ id: record.id, hlc, fields }));
}

/**
 * Whether a stored record should be visible to queries: not deleted and fully created.
 * @param {StoredRecord | undefined} record
 * @returns {boolean}
 */
export function isVisible(record) {
  return record !== undefined && record.deleted !== true && typeof record.createdAt === 'string';
}
