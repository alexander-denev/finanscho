# Sync protocol

Finanscho is local-first. Every device keeps a full copy of the data in IndexedDB and works
offline. When a WebDAV server is configured, devices exchange **operations** through it so that
all devices converge to the same state, regardless of the order in which they receive changes.

The server is dumb storage: no locks, no transactions, no server-side logic. The protocol never
requires two devices to write the same file.

## 1. Data model

### 1.1 Records

Every synced entity record (`accounts`, `categories`, `transactions`, `budgets`,
`recurringRules`) is stored as its plain fields plus sync metadata:

```json
{
  "id": "0b7c…",
  "name": "Wallet",
  "openingBalanceMinor": 0,
  "deleted": false,
  "createdAt": "2026-09-30T08:00:00.000Z",
  "updatedAt": "2026-09-30T08:00:00.000Z",
  "_clocks": {
    "name": "001727683200000-000000-5f0c…",
    "openingBalanceMinor": "001727683200000-000000-5f0c…",
    "deleted": "001727683200000-000000-5f0c…",
    "createdAt": "001727683200000-000000-5f0c…",
    "updatedAt": "001727683200000-000000-5f0c…"
  }
}
```

- `_clocks` maps each field name to the HLC string of the op that last wrote it. `id` has no
  clock.
- Deletion is a tombstone: `deleted: true` with its own clock. Tombstones are kept forever (v1 has
  no compaction) and hidden from every query.
- A record is **visible** only when `deleted !== true` and `createdAt` is present. A record can be
  temporarily incomplete when an edit from device B arrives before the create from device A; it
  stays hidden until the create arrives.
- Aggregates (balances, budget spent) are never stored; they are computed from indexed queries.

### 1.2 Hybrid logical clock (HLC)

Each op carries an HLC timestamp serialized as a fixed-width string:

```
<wall ms, 15 digits>-<counter, 6 digits>-<deviceId>
001727683200000-000003-5f0c3b1e-8a4d-4c1e-9b1a-2d3f4e5a6b7c
```

String comparison equals clock comparison. The `deviceId` (a UUID, fixed width) breaks ties
between devices. Rules:

- **Local event** (`tick`): `wall = max(state.wall, now)`; if `wall` did not advance, `counter + 1`,
  else `counter = 0`.
- **Receive** (`receive(remote)`): `wall = max(state.wall, remote.wall, now)`; the counter is
  `max` of the counters whose wall equals the new wall, plus one (0 if only `now` reached it).
- If the counter would exceed 999 999 the wall is advanced by 1 ms and the counter reset, so the
  clock stays monotonic and fixed-width.
- The HLC state (`wall`, `counter`) is stored in `meta` and read and written **inside** the same
  IndexedDB transaction as each write, so several tabs never issue the same clock.
- A fixed minimum clock `SEED_HLC` (`000000000000000-000000-00000000-0000-0000-0000-000000000000`)
  is used for seeded default categories, so any real user edit or deletion always wins over a seed.

### 1.3 Operations

```json
{
  "v": 1,
  "deviceId": "5f0c3b1e-…",
  "seq": 42,
  "hlc": "001727683200000-000003-5f0c3b1e-…",
  "entity": "transactions",
  "id": "9d2e…",
  "fields": { "amountMinor": 1250, "note": "Lunch", "updatedAt": "2026-09-30T08:00:00.000Z" },
  "origin": "user"
}
```

- `v`: op format version (1). Ops with a higher `v` are skipped and reported, never half-applied.
- `seq`: the device's local sequence number, gap-free and strictly increasing from 1.
- `entity`: one of `accounts`, `categories`, `transactions`, `budgets`, `recurringRules`.
  Ops for unknown entities are skipped (kept on the server for newer clients).
- `fields`: the field values written. A create contains every field; an edit contains only the
  changed fields plus `updatedAt`. A delete is `{ "deleted": true, "updatedAt": … }`.
- `origin`: `"user"` or `"recurrence"` (occurrences materialized from a recurring rule).
- Unknown fields inside `fields` are stored as-is, so older clients never destroy newer data.

## 2. Merge

Per-field last-writer-wins (`src/infrastructure/sync/merge.js`, pure functions):

For each `(field, value)` in an incoming op:

1. Let `stored` be `record._clocks[field]` (absent = never written).
2. If `stored` is absent or `op.hlc > stored`: write the value and set the clock.
3. If `op.hlc === stored` and the values differ: the value whose canonical JSON serialization is
   greater wins. (Equal clocks with different values only occur if two devices generate the
   "same" deterministic record differently, e.g. after an app upgrade; the tiebreak still makes
   every device converge.)
4. Otherwise ignore the field.

A missing record is created from the op the same way. The merge is a join over a per-field
lattice ordered by `(hlc, canonical value)`, so it is **commutative, associative, and idempotent**:
receiving ops in any order, any number of times, gives the same state. This is verified with
property-style tests over shuffled and duplicated op sequences.

Local writes use exactly the same merge function: the `ChangeRecorder` builds an op and merges it.
Because the HLC is advanced past every clock the device has seen, a normal local edit always
wins locally.

## 3. Deterministic IDs

Records that two devices can create independently before syncing use deterministic IDs so they
merge into one record instead of duplicating:

| Record               | ID                       | Clock used for its fields |
| -------------------- | ------------------------ | ------------------------- |
| Seeded category      | `seed:<slug>`            | `SEED_HLC` (minimum)      |
| Budget               | `<categoryId>:<YYYY-MM>` | normal local HLC          |
| Recurring occurrence | `<ruleId>:<YYYY-MM-DD>`  | the rule's creation clock |

Recurring occurrences are built entirely from the immutable rule (including `createdAt` and
`updatedAt`, which equal the rule's `createdAt`) and are written with the rule's creation clock
(`rule._clocks.createdAt`). Two devices materializing the same occurrence therefore produce
byte-identical fields and clocks, and any later user edit or deletion (with a newer HLC) wins.
Materialization never writes an occurrence whose ID already exists locally, in any state
(including deleted), so deleting an occurrence is permanent.

## 4. Local write path

All local writes go through `ChangeRecorder` (`src/infrastructure/db/ChangeRecorder.js`). In a
**single IndexedDB transaction** it:

1. reads the HLC state and ticks it,
2. builds the op and merges it into the entity record (updating `_clocks`),
3. increments `localSeq` and appends the op to `outbox`,
4. writes back the HLC state and `localSeq`.

After the transaction commits, it publishes `{ entities, source: 'local' }` to the change feed.
If the app crashes before commit, nothing is written; after commit, the op is durably queued.

Remote ops are applied by `ChangeRecorder.applyRemote()` — one IndexedDB transaction per segment
that merges every op, advances the HLC (`receive`), and advances that device's cursor.

## 5. Server layout

```
<baseUrl>/<vaultPath>/
  vault.json                                     { "format": 1, "createdAt": "…" }
  devices/<deviceId>/head.json                   { "deviceId", "deviceName", "lastSeq", "segments": [ … ] }
  devices/<deviceId>/ops/<startSeq>-<endSeq>.json   immutable JSON array of ops
```

- `vault.json` is created (by `PUT`) only if absent. It is the only shared file and is written at
  most once per vault; racing creators write identical content, so the race is harmless.
- Each device writes **only inside `devices/<its deviceId>/`**. Write conflicts on the server are
  impossible.
- Segment names use seqs zero-padded to 12 digits, e.g. `000000000001-000000000500.json`.
- `head.json`:

  ```json
  {
    "deviceId": "5f0c…",
    "deviceName": "Pixel 8",
    "lastSeq": 742,
    "segments": [
      { "file": "000000000001-000000000500.json", "startSeq": 1, "endSeq": 500 },
      { "file": "000000000501-000000000742.json", "startSeq": 501, "endSeq": 742 }
    ],
    "updatedAt": "2026-09-30T08:00:00.000Z"
  }
  ```

## 6. Sync cycle

A cycle is **pull, then push**. Only one cycle runs at a time (a mutex in `SyncEngine`); a
request during a running cycle is coalesced into one follow-up cycle.

### 6.1 Prepare

1. `MKCOL` the vault, `devices/`, `devices/<own>/`, and `devices/<own>/ops/` (tolerating "already
   exists": 405/301).
2. `GET vault.json`. If absent, `PUT` `{ "format": 1, "createdAt": … }`. If `format` is greater
   than the supported format (1), **stop**: report `vaultTooNew` ("update the app"), and never
   write anything to this vault.

### 6.2 Pull

1. `PROPFIND` (Depth: 1) on `devices/` to list device folders; skip our own.
2. For each remote device, `GET devices/<id>/head.json`. Validate it. If `lastSeq` is greater than
   our cursor for that device, fetch the segments that contain seqs after the cursor, in order.
3. For each segment: validate it (array of well-formed ops, all from that device, seqs contiguous
   and matching the file name). In **one IndexedDB transaction**, merge every op with
   `seq > cursor` and set the cursor to the segment's last seq.
4. A malformed head or segment is skipped and reported (`malformed`) without crashing; the cursor
   does not move past it, so it is retried next cycle. Other devices still sync.
5. After pulling, run recurring materialization, then publish `{ entities, source: 'remote' }`.

### 6.3 Push

1. Read up to 500 outbox ops in seq order.
2. `PUT` the new immutable segment file `ops/<start>-<end>.json`.
3. `PUT` the updated `head.json` including the new segment. The segment is always written before
   the head, so readers never see a head pointing at a missing file.
4. Only after both succeed, delete those ops from the outbox. Repeat until the outbox is empty.

The device's own `head.json` is read at the start of the push (and cached) so the segment list is
preserved.

### 6.4 Crash safety

| Crash point                        | Effect                                                                                                                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Before local IDB commit            | The change never happened; nothing to sync.                                                                                                                   |
| After segment PUT, before head PUT | Readers do not see the segment (head unchanged). The ops are still in the outbox; the next push rewrites the same segment file (same seqs) and then the head. |
| After head PUT, before outbox trim | The ops are published. The next push finds `head.lastSeq ≥` those seqs and simply trims them from the outbox without re-uploading.                            |
| During pull, mid-segment           | The IDB transaction for that segment rolls back; the cursor has not moved, so the segment is re-applied (merge is idempotent).                                |

## 7. Versioning and safety

- `vault.json.format` > supported ⇒ stop syncing, show "update the app", never write.
- Unknown op fields are stored as-is; unknown entities and ops with a newer `v` are skipped.
- Every downloaded file is validated before use.
- Credentials are stored via the `credentialStore` port (IndexedDB in v1; see DECISIONS).

## 8. Transport

WebDAV over HTTP with Basic auth, implemented in `WebDavClient` on top of an `httpAdapter` port:

- `ensureCollection(path)` — `MKCOL`, tolerating 405 (exists) and 301.
- `get(path)` — `GET`, returns `null` on 404.
- `put(path, body)` — `PUT` with `Content-Type: application/json`.
- `list(path)` — `PROPFIND` with `Depth: 1`, parsing the multistatus XML with `DOMParser`
  (elements matched by `namespaceURI === 'DAV:'` and `localName`, so any prefix works).
- `checkAccess()` — `PROPFIND` with `Depth: 0` on the server URL; used by "Test connection",
  which never writes.

There is one adapter, `FetchHttpAdapter` (`fetch`), on every platform (DECISIONS D35). The WebDAV
server must therefore send CORS headers for the app's origin on every platform, including iOS:
allowed methods `GET, PUT, PROPFIND, MKCOL, OPTIONS`, request headers
`Authorization, Content-Type, Depth, Cache-Control`, and preflight `OPTIONS` requests answered
without authentication. For local development, set `WEBDAV_PROXY_TARGET` in `.env.local` and use
`http://localhost:5173/webdav-proxy/…` as the server URL (Vite dev-server proxy).

### Changing vaults

When the user points the app at a different server URL or vault path than the one it last synced
with, the app re-queues every record's current state as ops (keeping the original clocks) and
clears all cursors before the first sync, so the new vault receives the full data set.

If a device finds that the server has lost ops it already published and trimmed (its own
`head.json` is behind its outbox, e.g. after a server restore), it re-queues its full state once.
Readers tolerate gaps between segments for this reason.

## 9. Scheduling

When WebDAV is configured, a cycle runs on app start; on resume (`visibilitychange`); 5 s after the last local write (debounced); every 5 minutes while
in the foreground; and on "Sync now". Transient failures (offline, network, 5xx) back off
exponentially (5 s, 10 s, 20 s … capped at 5 minutes). Auth, format, and configuration errors
get no backoff retries; the regular triggers (resume, the 5-minute interval, "Sync now", and
changing the settings) still try again. Recurring materialization also runs at local midnight while
the app is open.
