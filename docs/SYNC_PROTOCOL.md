# Sync protocol

Finanscho is local-first. Every device keeps a full copy of the data in IndexedDB and works
offline. When a WebDAV server is configured, devices exchange **operations** through it so that
all devices converge to the same state, regardless of the order in which they receive changes.

The server is dumb storage: no locks, no transactions, no server-side logic. The protocol never
requires two devices to write the same file.

## 1. Data model

### 1.1 Records

Every synced entity record (`accounts`, `categories`, `transactions`, `budgets`,
`automations`) is stored as its plain fields plus sync metadata:

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
- Deletion is a tombstone: `deleted: true` with its own clock, hidden from every query.
  Tombstones are never purged, but old ones shrink to **stubs** (§10.5): `id`, `deleted`,
  `updatedAt`, and any field written after the delete, with their clocks.
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
- `entity`: one of `accounts`, `categories`, `transactions`, `budgets`, `automations`.
  Ops for unknown entities are skipped (kept on the server for newer clients). Ops for retired
  entities (`recurringRules`, written by versions before automations, D50) are dropped.
- `fields`: the field values written. A create contains every field; an edit contains only the
  changed fields plus `updatedAt`. A delete is `{ "deleted": true, "updatedAt": … }`.
- `origin`: `"user"` or `"automation"` (results of an automation). Older versions also wrote
  `"recurrence"`. Informational only: clients accept any string.
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

| Record                         | ID                                      | Clock used for its fields   |
| ------------------------------ | --------------------------------------- | --------------------------- |
| Seeded category                | `seed:<slug>`                           | `SEED_HLC` (minimum)        |
| Budget                         | `<categoryId>:<YYYY-MM>`                | normal local HLC            |
| Budget set by an automation    | `<categoryId>:<YYYY-MM>`                | the automation's rule clock |
| Transaction from a schedule    | `<automationId>:t<i>:a<j>:<YYYY-MM-DD>` | the automation's rule clock |
| Transaction from a transaction | `<automationId>:a<j>:<sourceId>`        | the automation's rule clock |
| Run now                        | `<automationId>:run:<uuid>`             | normal local HLC            |

`t<i>` and `a<j>` are the trigger's and the step's positions; the date is the **planned** date
(before a weekend shift). The **rule clock** is the newest clock among the automation's rule
fields (`triggers`, `conditions`, `actions`, `startDate`), read inside the IndexedDB
transaction that writes the results (D51). Results are built only from those fields, the planned
date, and the recorded transaction, and `createdAt`/`updatedAt` are the clock's time (or the
recorded transaction's creation time when later). Two devices making the same result from the
same version therefore write byte-identical records; when one device used an older version, the
newer version's clock wins; any user edit or deletion (a fresh HLC) beats both.

A result is never written when its ID already exists locally in any state (including deleted), so
deleting a result is permanent, and a budget month that has any record (the user's own, or a
deleted one) is left alone. Existing transaction IDs are found by the key prefix
`<automationId>:`, so tombstone stubs still count. Automations are edited in place (D52): an edit
to the rule fields moves `startDate` to today, and resuming sets `startDate` to today, so no
device fills in dates before it.

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
  impossible. The one exception is **removing a device** (§11): user-initiated, and it only ever
  deletes another device's folder.
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

- After a compaction the head also carries an optional `checkpoint` (§10.2), and its `segments`
  start at the checkpoint instead of at seq 1:

  ```json
  {
    "lastSeq": 9120,
    "segments": [
      { "file": "000000008701-000000009040.json", "startSeq": 8701, "endSeq": 9040 },
      { "file": "000000009041-000000009120.json", "startSeq": 9041, "endSeq": 9120 }
    ],
    "checkpoint": {
      "startSeq": 8701,
      "endSeq": 9040,
      "frontier": { "a71e…": 3310, "c9d2…": 512 },
      "createdAt": "2026-10-02T08:00:00.000Z"
    }
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

1. `PROPFIND` (Depth: 1) on `devices/` to list device folders; skip our own. Cursors of devices
   that are no longer listed are dropped (a device that returns has seqs above any stale cursor).
2. `GET` and validate every remote `head.json` first. Then, device by device (the one whose
   unread checkpoint covers the most unread ops of others first, §10.4), if `lastSeq` is greater
   than our cursor for that device, fetch the segments that contain seqs after the cursor, in order.
3. For each segment: validate it (array of well-formed ops, all from that device, seqs contiguous
   and matching the file name). In **one IndexedDB transaction**, merge every op with
   `seq > cursor` and set the cursor to the segment's last seq.
4. A malformed head or segment is skipped and reported (`malformed`) without crashing; the cursor
   does not move past it, so it is retried next cycle. Other devices still sync.
5. After pulling, restore deleted accounts and categories that a transaction or automation uses
   again (D42, D48, D53), run automations (schedules always; "a transaction is recorded" only when
   transactions or automations arrived), then publish `{ entities, source: 'remote' }`.

### 6.3 Push

1. Read up to 500 outbox ops in seq order.
2. `PUT` the new immutable segment file `ops/<start>-<end>.json`.
3. `PUT` the updated `head.json` including the new segment. The segment is always written before
   the head, so readers never see a head pointing at a missing file.
4. Only after both succeed, delete those ops from the outbox. Repeat until the outbox is empty.

The device's own `head.json` is read at the start of the push (and cached) so the segment list (and
any `checkpoint`) is preserved.

After a successful pull and push, the cycle runs **maintenance**: compaction when due and cleanup
of superseded files (§10). Maintenance failures never fail the cycle.

### 6.4 Crash safety

| Crash point                        | Effect                                                                                                                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Before local IDB commit            | The change never happened; nothing to sync.                                                                                                                   |
| After segment PUT, before head PUT | Readers do not see the segment (head unchanged). The ops are still in the outbox; the next push rewrites the same segment file (same seqs) and then the head. |
| After head PUT, before outbox trim | The ops are published. The next push finds `head.lastSeq ≥` those seqs and simply trims them from the outbox without re-uploading.                            |
| During pull, mid-segment           | The IDB transaction for that segment rolls back; the cursor has not moved, so the segment is re-applied (merge is idempotent).                                |

Compaction adds its own rows; see §10.6.

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
- `delete(path)` — `DELETE`; a path ending in `/` deletes a collection and everything in it
  (RFC 4918 §9.6). 404 counts as success. Used only for a device's own superseded files (§10.3).
- `checkAccess()` — `PROPFIND` with `Depth: 0` on the server URL; used by "Test connection",
  which never writes.

There is one adapter, `FetchHttpAdapter` (`fetch`), on every platform (DECISIONS D35). The WebDAV
server must therefore send CORS headers for the app's origin on every platform, including iOS:
allowed methods `GET, PUT, PROPFIND, MKCOL, DELETE, OPTIONS`, request headers
`Authorization, Content-Type, Depth, Cache-Control`, and preflight `OPTIONS` requests answered
without authentication. For local development, set `WEBDAV_PROXY_TARGET` in `.env.local` and use
`http://localhost:5173/webdav-proxy/…` as the server URL (Vite dev-server proxy). Without `DELETE`
sync still works; only cleanup of superseded files is blocked (`cleanupBlocked` in the status).

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
changing the settings) still try again. Automations also run at local midnight while the app is
open, and shortly after local transaction changes.

## 10. Compaction

Without compaction every segment stays on the server, every head lists them all, and a new device
replays every op of every device from seq 1. Compaction bounds each device's log with
**per-device checkpoints**. The vault format stays 1: old clients read compacted logs correctly
and ignore the new head field, and a device still writes only its own folder.

### 10.1 Checkpoints

Merge is a join (§2), so a device's full local state — every record with its per-field clocks —
contains, in lattice terms, every op it has ever published, and every remote op it applied. A
checkpoint re-queues that state as fresh ops with new seqs, keeping the original clocks
(`ChangeRecorder.queueCheckpoint`, one IndexedDB transaction):

- it runs only with an **empty outbox** (every earlier op is published) and no other checkpoint
  pending; local writes land entirely before (then it waits) or after it;
- it emits one op per distinct field clock per record (`recordToOps`), with tombstones reduced to
  stubs (§10.5); cursors are **kept**;
- it records the **frontier**: our cursor for each remote device, except devices with deferred ops
  (§7), whose ops are not in our state;
- it stores `meta.pendingCheckpoint = { startSeq, endSeq, frontier, createdAt }`.

The full state, not just this device's own fields, is checkpointed, so the checkpoint stays correct
after backup imports and vault switches, which replay other devices' records through this device.

**When.** A device compacts at the end of a successful cycle when more than
`max(5000, size of its last checkpoint)` of its own ops follow that checkpoint, and only if the
checkpoint is smaller than the log it replaces. Its server log stays below about twice its state
plus 5000 ops, and compaction traffic is a constant fraction of normal sync traffic. "Clean up
server data" (`compactNow`) compacts whenever that makes the log smaller and always cleans up.

### 10.2 Publishing

The checkpoint ops are pushed like any other ops, with two rules:

1. A segment never straddles `pendingCheckpoint.endSeq`.
2. The head PUT for the segment ending at `endSeq` lists only segments with
   `startSeq ≥ checkpoint.startSeq` and records `checkpoint`. Every later head carries it on.
   Then `pendingCheckpoint` is cleared and `meta.gcPending` set.

`checkpoint` is validated by readers: its range must be exactly a contiguous run of listed segments
and the frontier must map device IDs to non-negative safe integers. An invalid checkpoint is
ignored, never fatal.

### 10.3 Cleanup

While `meta.gcPending` is set (and on "Clean up server data"), the device lists its own `ops/`
folder and deletes every segment file that its current head does not list and that ends at or
before `lastSeq`: files superseded by the checkpoint and orphans from crashed pushes. Files past
`lastSeq` may still be published by a later push and are kept. A failed `DELETE` (for example
`405`, or a network error when the server's CORS rules do not allow `DELETE`) stops cleanup for
that cycle, is reported in `cleanupIssues` and as `cleanupBlocked` in the status, and is retried
next cycle; it never causes backoff or an error state.

A reader that fetched the previous head may find a deleted file `missing`; it is reported as an
issue for that cycle, and the next cycle reads the new head.

### 10.4 Reading checkpoints and the frontier shortcut

A reader whose cursor is below the checkpoint simply applies it: the trimmed ops are contained in
the checkpoint's state, and readers already tolerate gaps between segments (§8, "Changing
vaults"). Re-applying ops is a no-op. A client from before compaction does exactly this and
converges.

A current client also uses the frontier. When it applies the segment that ends at
`checkpoint.endSeq`, it holds every op of the checkpoint, so it holds every op of each frontier
device up to that seq. In the **same IndexedDB transaction** it raises those cursors to
`max(cursor, frontier[id])` (`applyRemote`'s `frontier` argument). To make the most of this, a
pull reads all heads first and applies the device whose unread checkpoint covers the most unread
ops of others first. A new device therefore downloads roughly one full snapshot plus tails, not
every device's full history.

### 10.5 Tombstone stubs

A stub keeps `id`, `deleted`, `updatedAt`, and every field whose clock is newer than
`_clocks.deleted`, each with its clock. Dropping older fields is safe because nothing un-deletes a
record without rewriting every field (accounts and categories are archived, never deleted; budgets
are re-set in full, `deleted: false` included), and such a rewrite must beat the delete clock to
win `deleted`, so it beats every dropped field too. Fields written after the delete must stay: a
rewrite older than them may still win `deleted`.

- Checkpoints always publish tombstones as stubs.
- `ChangeRecorder.pruneTombstones` rewrites tombstones deleted more than 30 days ago as stubs at
  startup. This is local only (no ops) and drops them from the `date`/`accountId` indexes.
- **Stubs are never purged**: automations rely on a result's ID existing (§3), and
  `_clocks.deleted` must keep beating late ops. The remaining growth is about 150 bytes per
  deletion.

Devices may differ in whether a tombstone still carries its older fields; what users see is the
same. Tests compare snapshots with tombstones reduced to stubs.

### 10.6 Crash safety

| Crash point                                         | Effect                                                                                                                                                         |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| While queueing the checkpoint                       | The IDB transaction rolls back; nothing was queued.                                                                                                            |
| After a checkpoint segment PUT, before its head PUT | The head still lists the old segments; the checkpoint ops are still in the outbox and `pendingCheckpoint` is set. The next push rewrites the segment and head. |
| After the checkpoint head PUT, before the trim      | The next push sees `lastSeq ≥ endSeq`, clears `pendingCheckpoint`, sets `gcPending`, and trims the outbox without re-uploading.                                |
| During cleanup                                      | `gcPending` is still set; the next cycle lists `ops/` again and deletes what is left.                                                                          |

## 11. Removing a device

Every reinstall or retired browser leaves a `devices/<id>/` folder behind. Settings → Devices
lists the devices of the vault (from the heads read in the last pull: name, last head update,
whether everything it published is applied here) and offers **Remove**, after a confirmation that
warns more strongly when the device synced in the last 7 days.

`SyncEngine.removeDevice(id)` runs inside the sync mutex, as part of a cycle:

1. Run a full pull (and push).
2. Require that our cursor for the device equals its head's `lastSeq` (its head is readable) and
   that none of its ops are deferred here. Otherwise reject with `removeIncomplete` and change
   nothing.
3. Queue a checkpoint (§10.1) and push until its head is published. Our checkpoint now contains
   all of the removed device's surviving data.
4. `DELETE devices/<id>/` (a collection `DELETE` is recursive, RFC 4918 §9.6).
5. Drop its cursor.

Readers that had not finished reading the removed device get its data through our new checkpoint:
its seqs are above every reader's cursor for us. Frontier entries for devices no longer listed
are ignored.

**This is the single-writer exception.** It is user-initiated, it only ever deletes, and the
data it deletes is already republished by the remover.

**A removed device that is still in use.** Its next segment `PUT` fails with `409`/`404`
(`notFound`). The device recreates its folder and retries once; its own head is gone, so the gap
check (§8, "Changing vaults") republishes its full state, and it re-reads all devices. Merge makes
this safe, and tombstones (stubs included) make sure deletes made in the meantime still win. A
restarted engine recreates the folder in `prepare` and republishes on its next push the same way.
