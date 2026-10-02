# Decisions log

Dated record of decisions, deviations from the build brief, and their reasons. Newest entries are
appended at the bottom of each day.

## 2026-09-30

### D1. ESLint 9 instead of ESLint 10

ESLint 10.11 is the latest release, but `eslint-plugin-react@7.37.5` and
`eslint-plugin-jsx-a11y@6.10.2` (both latest) declare peer support only up to ESLint 9. The brief
asks for "ESLint 9+", so we use **ESLint 9.39.5** with `@eslint/js@9.39.5`. `eslint-plugin-unicorn`
versions from 66 on require ESLint ≥ 10.4, so we pin **`eslint-plugin-unicorn@65`**, the latest
release compatible with ESLint 9. Revisit when the React and a11y plugins support ESLint 10.

### D2. TypeScript 6.0 instead of TypeScript 7

`typescript@7` is the latest release, but `eslint-plugin-import-x` pulls in `@typescript-eslint/utils`,
whose peer range is `typescript >=4.8.4 <6.1.0`. npm resolved **TypeScript 6.0.3**, which fully
supports `checkJs` with JSDoc. TypeScript is used only for `tsc --noEmit` type checking.

### D3. Vitest 5 on Node 25

Vitest 5.0.2 declares `node: ^22.12.0 || ^24.0.0 || >=26.0.0` (it skips the odd, non-LTS Node 25).
The development machine runs Node 25.8, where the full suite runs without issues. CI should use
Node 24 LTS. Per-folder environments use Vitest's `test.projects` (`node` and `dom` projects in
`vitest.config.js`).

### D4. Layer rules use regex patterns; `shared/` is a leaf

`no-restricted-imports` uses `patterns[].regex` so relative imports such as
`../../infrastructure/db/database.js` are matched by folder name regardless of depth. `src/shared/`
(tiny framework-free utilities used by several layers) is not in the brief's table; it is made a leaf
that may import nothing from the other layers, so it can never create an upward dependency.

### D5. `maxNodeModuleJsDepth: 0`

`jsconfig.json` defaults `maxNodeModuleJsDepth` to 2, which made `tsc` type-check the untyped JS
inside `fake-indexeddb`. Setting it to 0 limits checking to our own sources and packages' `.d.ts`.

### D6. Test setup files in `tests/helpers/`

The per-environment setup files (`nodeSetup.js` installs `fake-indexeddb/auto`; `domSetup.js`
also registers Testing Library cleanup) live in `tests/helpers/`, the only non-mirrored test
folder in the file structure.

### D7. JSDoc rules

We use `eslint-plugin-jsdoc`'s `flat/recommended-typescript-flavor-error` preset and require JSDoc
on every exported function, class, and method (`publicOnly`). Types are mandatory; prose
descriptions for every parameter and return value are not (`require-param-description` and
`require-returns-description` are off), because the typed signatures carry the information and
mandatory boilerplate prose adds noise. Tests are exempt from `require-jsdoc`.

### D8. `settings.react.version = "18.3"`

Preact 10's public API matches React 18, so `eslint-plugin-react` is told to assume React 18.3.

### D9. Explicit file extensions in imports

`import-x/extensions` requires the `.js`/`.jsx` extension on every relative import. This matches
native ES module resolution and makes `caseSensitiveStrict` checks unambiguous.

### D10. `@babel/core` dev dependency

`@preact/preset-vite` declares `@babel/core` as a peer dependency, so it is installed as a
development dependency. It is not a runtime dependency.

### D11. `no-unused-vars` ignores rest siblings

Destructuring with a rest element (`const { _clocks, ...entity } = record`) is the idiomatic way to
omit fields without mutation. `no-unused-vars` is configured with `ignoreRestSiblings: true` (and
`argsIgnorePattern: '^_'` for required-but-unused callback parameters).

### D12. Relaxed JSDoc rules in tests

Tests may use `any` casts (to feed deliberately malformed data to validators) and are not
required to document `@returns` on small helpers (`jsdoc/reject-any-type` and
`jsdoc/require-returns` are off under `tests/`). Source code keeps the full rules.

### D13. Extra IndexedDB indexes

Besides the indexes named in the brief, `transactions` has `[date+createdAt]` (the list order:
newest date, then newest entry, walked with a cursor so pages stay bounded) and
`recurringRuleId`; `categories` has `kind`. Adding indexes later would need a migration, so they
are part of schema v1.

### D14. Seeded categories use a fixed minimum clock

Two devices seeding the default categories independently must not overwrite a user's later edit
on the other device. Seed records are therefore written with `SEED_HLC` (the minimum clock), only
when the ID does not exist locally in any state. Any real edit or deletion always wins. Seeded
names are stored in English (the only v1 locale) so seeds are identical on every device; users
rename them freely.

### D15. Unsupported remote ops are deferred, not dropped

Ops with a newer op version or an unknown entity are kept in `meta.deferredOps` and replayed at
startup once the app understands them, instead of being discarded when the cursor advances.

### D16. Backup import replays records through the write path

Importing a backup splits each record into one op per distinct field clock and writes those ops
through `ChangeRecorder` with their original clocks. Into an empty database this restores the
records exactly (same values and `_clocks`); into a non-empty one it is the normal merge. The ops
land in the outbox, so a restored device pushes its data when sync is enabled. Fields that would
not change are skipped, so re-importing the same file queues nothing.

### D17. Immutable account currency and category kind

An account's currency cannot change after creation (its transactions are denominated in it), and
a category's kind (income/expense) cannot change (transactions and budgets reference it by kind).
Accounts and categories are archived, never deleted, so no transaction is left dangling.

### D18. Records must be complete to be visible

With per-field merge, an edit from device B can arrive before the create from device A. Records are
visible only when `deleted !== true` and `createdAt` is present; incomplete records stay hidden until
the create arrives.

### D19. Native HTTP: PROPFIND/MKCOL work on iOS, not on Android

> **Superseded by D35** (2026-10-02): the native shells were removed; every platform uses `fetch`.

Verified by reading the installed Capacitor 8.5 sources (there is no Android SDK or Xcode on the
build machine, so no on-device test was possible):

- **iOS**: `CapacitorUrlRequest` sets `URLRequest.httpMethod = method`. `URLSession` sends any
  method token, so `PROPFIND` and `MKCOL` work through `CapacitorHttp`. Request bodies given as strings are
  sent verbatim when a `Content-Type` header is present (`getRequestData` tries the string path
  before JSON serialization), and `WebDavClient` always sets `Content-Type` for `PUT` and
  `PROPFIND`, so JSON segments are not double-encoded.
- **Android**: `HttpRequestHandler` calls `HttpURLConnection.setRequestMethod(method)`, which only
  accepts `GET, POST, HEAD, OPTIONS, PUT, DELETE, TRACE` and throws `ProtocolException` for
  `PROPFIND` and `MKCOL`.

What v1 does, explicitly rather than silently:

- `NativeHttpAdapter` knows the Android method set and rejects other methods with the
  `unsupportedMethod` sync error before calling the plugin (unit-tested).
- The composition root uses `NativeHttpAdapter` on iOS and `FetchHttpAdapter` (WebView `fetch`) on
  Android and the web. On Android the WebDAV server must therefore allow CORS for the WebView origin
  `https://localhost`, like a desktop browser. The settings help text says so.

Proposed fix: add a small local Capacitor plugin for Android (for example `WebDavHttp`) built on
OkHttp, which accepts any method token, exposing the same `request(method, url, headers, body)`
contract, and select it in `createContainer.js` on Android. Alternatively, contribute
extension-method support to `CapacitorHttp` upstream. Both need an Android build environment to
implement and verify.

### D20. Multi-device tests live in `SyncEngine.multiDevice.test.js`

The three-device convergence simulations are long, so they sit next to `SyncEngine.test.js` in a
file named after the same source file plus a qualifier, keeping both files under ~300 lines.

### D21. Credentials in IndexedDB (v1)

> **Superseded by D35** (2026-10-02): a PWA has no Keychain/Keystore, so IndexedDB is the store.

WebDAV credentials are stored through the `credentialStore` port by `IdbCredentialStore`, in the
`meta` store. On Android and iOS this should be replaced with a Keychain/Keystore-backed
implementation (for example a secure-storage Capacitor plugin) behind the same port; that needs a new
runtime dependency and native verification, so it is deferred.

### D22. Switching vaults re-queues all data

The outbox only holds ops not yet pushed. When the user switches to a different server URL or vault
path, `ChangeRecorder.republishAll()` re-queues every record's current state (one op per distinct
field clock, original clocks kept) and clears all cursors, so the new vault gets the full data set.
The same happens once if a device detects that the server lost ops it had already trimmed (server
restore). Readers therefore tolerate gaps between segments in `head.json`.

### D23. PROPFIND parsing matches namespaceURI + localName

happy-dom's `getElementsByTagNameNS` returns no matches for prefixed XML elements, even though the
elements carry the correct `namespaceURI`. The client walks `getElementsByTagName('*')` and matches
`namespaceURI === 'DAV:'` and `localName`, which works in every DOM implementation and with any prefix.

### D24. Sync status additions

`SyncFailureReason` gains `unknown` (unexpected non-sync errors such as an IndexedDB failure), and
`SyncStatus` reports `deferredOps` (remote ops kept for a newer app version) and `issues` (malformed
remote files skipped) from the last cycle, so the UI can explain partial syncs.

### D25. Feature containers may use `useStores()`

Besides page components, a few feature-level containers read stores directly: the transaction
dialog (hosted by both the app shell and the transactions page), the settings page sections, and
the sync indicator. They are never generic: `ui/components` still never call `useStores()`, and the
forms they render (`TransactionForm`, `AccountForm`, `BudgetForm`, …) are presentational and
receive data and callbacks through props.

### D26. `ui/hooks/` for shared form logic

`useFormState()` (draft signal, typed validation errors, busy flag) lives in `src/ui/hooks/`, a
small extension of the file structure, because hooks are neither components nor i18n.

### D27. Shared UI moved to `ui/components`

`TransactionFields` (transaction + recurring forms), `BalanceList` (dashboard + accounts),
`UpcomingList` (dashboard + recurring), `ConfirmDialog`, `SwatchPicker`, and `MonthPicker`
(budgets + transactions) are used by two or more features, so they are generic components that
take plain props. Secondary pages without their own feature (More, Not found) live in
`ui/features/navigation/`.

### D28. Tab bar up to 1023 px

The brief specifies a bottom tab bar below 768 px and a sidebar from 1024 px. Between the two, the
tab bar layout is kept (with wider gutters), since a sidebar does not fit comfortably there.

### D29. Theme applies immediately

Choosing a theme saves and applies it at once (no "Save" needed), so the user sees the effect of
the choice. Default currency and device name are saved with the "Save settings" button.

### D30. Backup export uses a browser download

> **Superseded by D35** (2026-10-02): there is no WKWebView build any more; Safari and installed
> PWAs handle the download.

Export creates a Blob and triggers an `<a download>` click. This works in browsers and Android
WebViews; iOS WKWebView ignores `download` for blob URLs. Proposed follow-up for native: add
`@capacitor/filesystem` + `@capacitor/share` (new runtime dependencies) to save/share the file.
Import uses a standard file input, which works on all platforms.

### D31. Amount first, focused on open

The transaction and recurring forms put the amount field first. `Dialog` focuses the first
descendant marked `data-autofocus` right after `showModal()` (the native default would focus the
close button); `MoneyInput` sets it via its `initialFocus` prop. This avoids the `autoFocus`
attribute (flagged by `jsx-a11y/no-autofocus`) while giving keyboard and screen-reader users a
predictable starting point. The transaction dialog opens only after its draft (default account,
today's date) is loaded, so the field exists when focus moves.

### D32. Uniform store status

Every store exposes `status` and `error`. For `SyncStore` they describe loading the saved
configuration, and the live sync state is a separate signal, `syncStatus` (idle, syncing, offline,
error with a reason, last sync time). `ToastStore` never loads anything, so its `status` is always
`idle` and `error` always null; they exist only so every store has the same contract.

### D33. Node engines

`package.json` declares `"engines": { "node": ">=22.12" }`, the lowest version supported by Vitest 5
and `eslint-plugin-jsdoc`.

### D34. Override for a deprecated transitive dependency

The latest `workbox-build` (via `vite-plugin-pwa`) depends on the deprecated `glob@^11`.
`package.json` `overrides` scope **`glob@^13`** to `workbox-build`, which keeps the `globSync`
API it calls. The remaining `eslint@9` deprecation warning is expected (D1). Remove the override
when upstream updates the range. (An earlier `uuid` override for Capacitor's `xcode` dependency
went away with Capacitor, D35.)

## 2026-10-02

### D35. PWA only

The Capacitor shells for Android and iOS were barely used: no native plugins, never built, and
Android already fell back to `fetch` (D19). They added a second release path, a deprecated
dependency override (D34), and platform branches. Finanscho now ships as **one installable PWA**
that works fully offline.

- Removed `capacitor.config.json`, `android/`, `ios/`, `NativeHttpAdapter`, the `cap:sync`
  script, the `unsupportedMethod` sync reason, and `icon-1024.png`.
- `@capacitor/*` is banned in every file by `no-restricted-imports`. Because a later flat-config
  entry for the same rule replaces an earlier one, each layer rule repeats the ban.
- `platform.js` now exposes `detectPlatform(navigator)` → `{ os, browser }` (UA Client Hints, then
  the user-agent string; iPadOS in desktop mode is recognised by touch points). It is used only for
  the default device name and install instructions, never to switch features. Its tests live in
  `platform.test.js` (mirroring the source file) rather than `lifecycle.test.js`.
- `lifecycle.js` keeps only the `visibilitychange` path.
- Default device names are keyed `ios`/`android`/`desktop` (the old `web` key is gone).

**Behaviour change:** iOS sync used to bypass CORS through CapacitorHttp. Every platform now needs a
CORS-enabled WebDAV server (or the dev proxy). Supersedes D19, D21, and D30.

### D36. Silent, guarded service worker updates

`registerType: 'prompt'`, but nobody is prompted: `serviceWorker.js` applies a waiting update with
`updateSW(true)` as soon as it is safe. Safe means no `<dialog>` is open (every form lives in a
dialog) and no sync cycle is running, or the page is hidden. Otherwise it re-checks on the next
dialog `close` (listened for in the capture phase, because `close` does not bubble), sync status
change, or `visibilitychange`. `autoUpdate` was rejected because it reloads immediately and could
discard a half-filled form; a visible prompt was rejected as needless friction.

- The module reloads the page itself on `controllerchange`. vite-plugin-pwa reloads only when the
  page was already controlled when it registered, which is false on the first visit (the worker
  claims the page later through `clientsClaim`). Found with a headless-Edge check: the new worker
  activated but the old bundle kept running.
- It is injected into the composition root (`main.jsx` loads `virtual:pwa-register`, which only
  exists in Vite builds) so it can read the sync status. (It also showed a "works offline" toast once; removed in D46.)
- Registration errors go to `globalThis.reportError`, which logs without throwing (and needs no
  `no-console` exception). A failed update is reported and retried at the next safe moment.
- Hourly `registration.update()` while visible and online.
- Manual offline checks must use a normal reload: a forced reload (Shift+Reload, or
  `Page.reload({ ignoreCache: true })`) bypasses service workers by design.

### D37. `verifyPwaBuild` in the gate

`scripts/verifyPwaBuild.js` runs after `vite build` in `npm run check`. It asserts the manifest's
required fields, `any` icons at 192 and 512 px, a maskable icon, narrow and wide screenshots (PNG
sizes match the declared `sizes`), the manifest and touch-icon links in `index.html`, and that every
emitted file except `sw.js` and the workbox runtime is in the precache, so a future asset cannot
silently break offline use.

The install-sheet screenshots are the one deliberate exception: they are excluded from the
precache (`globIgnores`) because only the browser's install UI reads them, and the verifier allows
exactly the files the manifest lists (and checks they are not precached). They are real captures of
a production build with demo data (390×844 at 2× and 1440×900), taken with headless Edge. The
maskable icon is a separate file with the artwork scaled to 80% so it stays inside the safe zone.
Plan numbering note: decisions are numbered in the order they ship, so the plan's D41 is D37 and
its D37–D40 are D38–D41.

### D38. Install recommendation and persistence policy

Without a native shell IndexedDB is the only store, and browsers can evict it. Persistence is much
more likely for installed PWAs, so the app recommends installing and shows how well data is
protected.

- **Port and adapter.** `core/ports/installEnvironment.js` (display mode, install prompt,
  `appinstalled`, platform, `navigator.storage` with `null` for "unsupported") is implemented by
  `BrowserInstallEnvironment`, which takes `window` so tests pass a fake. It is created first in
  the composition root so an early `beforeinstallprompt` is captured (`preventDefault()`, kept for
  our own "Install" button). The `Platform` typedefs moved into the port.
- **When to recommend.** `InstallStore.showBanner` is true when the app is not installed, the user
  has real data (any account or transaction; accounts are never seeded), it is not snoozed
  (14 days after "Not now"), and it was dismissed fewer than 3 times. The snooze lives in settings
  (`installNoticeDismissedAt`, `installNoticeDismissCount`, via
  `SettingsService.loadInstallNotice/dismissInstallNotice`, which now takes the clock). It replaces
  `storageNoticeDismissed` and `SettingsStore.storagePersisted`.
- **Persistence.** At startup the store reads `persisted()` and calls `persist()` silently only
  when installed or in Chromium/Safari, which never prompt. Firefox shows a permission prompt and
  needs a user gesture, so it waits for "Protect my data". `persist()` runs again on install
  accept and on `appinstalled`.
- **Guidance.** `prompt` (browser offered one), `iosSafari`, `iosOtherBrowser` (open in Safari
  first), `firefoxDesktop` (cannot install; protect data or use another browser), `manual`.
  The iOS and other-browser cases warn that data does not move and offer the existing backup
  export first; elsewhere the dialog says data carries over.
- **iOS fresh install.** A standalone iOS app with no data shows a hint (Settings and the dashboard
  empty state) to import the backup or turn on sync. It disappears as soon as data exists, so it
  needs no stored "seen" flag.
- **Placement deviations from the plan.** `InstallInstructionsDialog` is used by two features
  (install banner, settings), so per the file rules it lives in `ui/components` as a
  presentational component; `ui/hooks/useInstallFlow.js` wires it to the stores for both. The
  backup download moved from `BackupSettings` into `ui/hooks/useBackupExport.js` for the same
  reason. The banner's buttons sit under the text rather than in `InlineMessage`'s side action
  slot, which squeezed the text into a narrow column on phones (seen in a headless-Edge capture).

### D39. Per-device checkpoints, no format bump

The server used to keep every op forever, a new device replayed every op of every device, and
orphans from crashed pushes were never removed. Each device now compacts its own log into a
checkpoint (SYNC_PROTOCOL §10):

- **Why per device, and why no format bump.** Merge is a join, so a device's full state covers
  every op it published or applied. Re-queuing that state (original clocks, new seqs) and trimming
  the head to it keeps every reader correct: readers already tolerate gaps (D22) and re-applying
  ops is a no-op. Only the device's own files change, so single-writer holds, and old clients
  read compacted logs unchanged (they ignore the optional `checkpoint` field). `VAULT_FORMAT`
  stays 1.
- **Full state, not own-authored fields.** Backup imports and vault switches replay other devices'
  records through this device (D16, D22), so "own" fields are not a clean subset. The full state
  is always correct; the frontier tells readers which other devices' ops it covers.
- **Frontier excludes devices with deferred ops** (D15): those ops are not in the state.
- **Size guard (addition to the plan).** Besides the `max(5000, last checkpoint size)` trigger, a
  checkpoint is queued only if it is smaller than the log the head lists (`maxOps`). Without it, a
  device with a small own log but a large shared state would grow its log by compacting. The
  randomized test first ran with zero compactions because of this guard; it now includes a
  repeated-edit workload and asserts that compactions and pruning actually happen.
- **Cleanup rule (generalized).** Cleanup deletes every own segment file that the current head
  does not list and that ends at or before `lastSeq` (the plan: "below the checkpoint start").
  Before any checkpoint, heads only grow, so such files were never listed: they are crash orphans.
  Files past `lastSeq` are kept, since a pending push may still publish them.
- **Cleanup failures are separate (deviation).** They go into `SyncResult.cleanupIssues`, not
  `issues`, because the UI maps `issues` to "files on the server were damaged". The status gets
  `cleanupBlocked`; the cycle still succeeds and there is no backoff.
- **Cursor pruning.** Cursors of devices no longer listed under `devices/` are dropped at the
  start of a pull.
- **Known limitation (pre-existing, now slightly sharper).** Two tabs of the same browser profile
  share one device ID and outbox but run separate engines; they could already race on the head.
  Cleanup could additionally delete a file the other tab just listed. Readers recover on the next
  cycle; a cross-tab lock (Web Locks API) is the proper fix.

### D40. Tombstone stubs, kept forever

Tombstones are never purged: recurring materialization skips IDs that exist in any state (SYNC_PROTOCOL
§3: deleting an occurrence is permanent), and `_clocks.deleted` must keep beating late
ops. They shrink instead: checkpoints publish stubs, and `pruneTombstones` rewrites tombstones
older than 30 days as stubs at startup (local only, no ops; stubs leave the `date`/`accountId`
indexes).

**Stub rule (refined from the plan).** The plan kept only `id`, `deleted`, `updatedAt`. A stub here
also keeps **every field whose clock is newer than `_clocks.deleted`**. Fields older than the
delete can go: an un-delete must rewrite every field with a clock that beats the delete, so it
beats them too. A field newer than the delete must stay: a full rewrite older than that edit can
still win `deleted`, and then the edit's value must win too. With today's code budgets are only
rewritten in full, so the plan's rule would also be safe; the refined rule costs almost nothing
and stays correct if a newer client sends a partial edit. A regression test sends such a partial
edit directly and fails with the plan's rule.

Devices can differ in whether a tombstone still carries its older fields (a replica that pruned it
may receive old field ops again). Visible data is identical; tests compare snapshots with every
tombstone reduced to its stub. Remaining growth is about 150 bytes per deletion.

### D41. Device removal: the single-writer exception

Every reinstall leaves a dead `devices/<id>/` folder that every pull lists and every new device
reads. Settings → Devices offers a user-confirmed **Remove** (SYNC_PROTOCOL §11):

- It runs inside the sync mutex as part of a cycle (queued removal requests are settled there), so
  it never interleaves with a pull or push. If the cycle fails, queued removals reject with the
  cycle's error.
- It is refused with `removeIncomplete` unless every op of that device is applied here and none
  is deferred, then publishes a fresh, unconditional checkpoint (no size guard) before the
  recursive `DELETE`. That checkpoint is what keeps the removed device's data available to
  devices that had not read it yet.
- Device removal is the only write outside a device's own folder: user-initiated, delete-only, and
  only after the data is republished.
- A removed device that is still alive recreates its folder on `notFound` (retrying once) and, its
  head being gone, republishes its full state through the existing gap check. Deletes still win
  because tombstones and stubs keep their clocks.
- Checkpoint frontiers are filtered to listed devices when applied, so readers do not resurrect
  cursors for removed devices (found by the third-device test).
- The device list comes from the heads already fetched in the last pull (no extra requests).
  "Inactive" means unseen for 90 days; the stronger warning applies within 7 days.
- "Clean up server data" (`compactNow`) and the `cleanupBlocked` help (add `DELETE` to the CORS
  methods) live in the same section.

### D42. Deleting accounts: only unused ones, and data wins over the delete

Users asked to delete accounts. Balances are computed from transactions, so deleting an account
with history would either orphan its transactions or delete them, and deleting transfers would
change other accounts' balances. Decision (with the user): **only accounts that no transaction
(either side of a transfer) and no recurring rule (including ended ones) uses can be deleted**;
anything else is archived. `AccountService.remove` enforces this and throws `InUseError`
(`accountInUse`); the UI checks first and explains instead of offering the confirm dialog.

- **Concurrent use.** Device A can delete an empty account while device B, offline, records a
  transaction in it. After every pull, `AccountService.restoreUsed` writes `deleted: false` for
  each deleted account a visible transaction or rule uses, so the data wins on both devices
  (both may write the same restore; LWW makes that harmless). Only tombstones that still carry
  their fields are restored: an account already shrunk to a stub (D40) would stay invisible, and
  restoring it every cycle would loop.
- **Archived accounts** move to their own tab on the Accounts page (shown once one exists) and are
  no longer offered as transaction filters; archiving or deleting the filtered account clears the
  filter. Users restore an account to filter by it.

### D43. Recurring budgets copied forward, not inherited

A per-budget "Repeat every month" switch (off by default; "Copy last month's budgets" stays for
budgets that don't repeat). Two designs were considered: a standing per-category limit with
monthly overrides (one record, but changing it rewrites history and needs an "explicit none"
marker), and **materialized monthly copies** (chosen), following recurring transactions:

- `BudgetService.materialize` (startup, after pull, local midnight, and after saving a repeating
  budget) finds each active expense category's newest budget record up to this month **in any
  state**. If it is visible and `recurring`, it is copied into every later month up to this month.
  A month with its own budget, a removed budget (tombstone), or a budget switched off ends the
  chain, so "Remove budget" also stops it repeating. Future months are not filled.
- **Clocks.** A copy is written with the source record's newest field clock (origin
  `recurrence`, so older clients accept the ops). Devices copying the same source converge on
  identical records, a copy of a newer source wins, and a user edit beats every copy. The vault
  format and op shape are unchanged; the new `recurring` field is absent on older budgets, which
  means `false`.
- `latestPerCategory` reads all budget records (including stubs, whose deterministic ID encodes
  category and month). Budgets are one per category and month, so this stays small.

### D44. Stop/resume keeps the same rule

Bug: stopping a recurring transaction and starting it again "copied" it and created an extra
transaction. Every edit ended the rule and created a new one, and for a stopped rule the form's
start date defaulted to today, so the new rule had a new anchor and materialized an occurrence
today (a duplicate when the old rule had already created today's).

- **Resume in place.** `endDate` is mutable, so `RecurringService.resume` clears it on the same
  rule, which keeps the ID and the anchor day (a rule on the 31st stays on month ends; a new rule
  would re-anchor). It continues from the first scheduled date on or after today that is after
  the old end date. The dates that fell while it was stopped are skipped (user decision): they are
  written as tombstones (`deleted: true`, no other fields) **before** the `endDate` op in one
  IndexedDB transaction, so any device that applies the new end date already has them and never
  materializes them.
- **Date-only edits in place.** `edit` reopens the same rule when the template and cadence are
  unchanged and the start date is one of the rule's own dates; skipped dates are handled as
  above. Other edits still split, and the new rule records `previousRuleId`; the list hides rules
  that were replaced. Stopped rules move to an "Ended" section with a Resume button.
- **Existence by key prefix (fix of a latent issue).** `occurrenceIdsForRule` used the
  `recurringRuleId` index, but tombstone stubs drop that field (D40) and skipped occurrences never
  have it. With more than 366 such dates, every run filled its catch-up batch with IDs that
  already existed and never progressed. It now reads primary keys in `[<ruleId>:, <ruleId>:￿]`
  (rule IDs are UUIDs, so the prefix is exact). A regression test covers 442 pruned skipped dates.
- **Known limitation.** Two devices resuming or splitting the same rule while both offline still
  produce two rules, as edits did before.

### D45. Optional categories and payee suggestions

- Income and expenses may be saved **without a category** (faster entry; assign later). A given
  category must still exist and match the kind. Transfers never have one. The transaction filter
  gains "Uncategorized" (`TransactionQuery.uncategorized`, transfers excluded); uncategorized
  spending counts in totals but in no budget.
- **Payee suggestions** use our own `ComboBox` (`ui/components`), a WAI-ARIA combobox with a
  listbox popup, no dependency. A native `<datalist>` was tried first and dropped: browsers render
  it differently, it can't be styled, and it can't show what a payee fills in. The list opens on
  focus (recent payees) and typing, ranks prefix matches before substring matches, bolds the
  match, and shows the category the payee will fill. ↓/↑/Enter choose; Escape closes only the
  list (its keydown is stopped so the enclosing `<dialog>` stays open); options are chosen on
  `mousedown` so focus stays in the input. Each option has an explicit `aria-label`
  ("Lidl, Groceries") because its text is split into highlight and detail spans.
  `TransactionRepository.recentPayees` walks the date index newest first, reading at most 2000
  records, and returns up to 200 distinct payees (case-insensitive) with the kind, category, and
  account of their latest use. They are loaded when the transaction dialog opens.
- Picking a known payee fills the category (and its kind) when none is chosen yet, and, for new
  transactions only, the account unless the user picked one. The payee field moved above the
  category and account it can fill (user decision).

### D46. No "works offline" toast; "Add account" buttons open the dialog

- The one-time "Finanscho now works offline" toast after the first service worker install is gone
  (user decision): it appeared on every first visit and told people nothing they had to act on.
  `startServiceWorker` no longer takes `onOfflineReady`.
- Every "Add account" button opens the add-account dialog. Outside the Accounts page (dashboard
  empty state, the transaction dialog's "add an account first" message) they go to
  `/accounts/new`, a route that renders `AccountsPage` with the add dialog open; closing or saving
  returns to `/accounts`. Chosen over a global account dialog (like `TransactionDialog` in
  `App.jsx`) to reuse the router and keep the dialog inside its feature (user decision). The
  transaction dialog closes before navigating, so the two dialogs never stack.

### D47. History routing instead of hash routing

- URLs are plain paths (`/accounts`) instead of `#/accounts` (user decision; the app is hosted at
  the root of its origin). `historyRouter.js` replaces `hashRouter.js`: `pushState` + `popstate`,
  and one `click` listener on the window that navigates plain same-origin `<a>` clicks in place
  (skipped for modifier keys, non-primary buttons, `target`, `download`, other origins). Links stay
  ordinary `<a href="/x">`, so no `Link` component is needed.
- Old hash links (bookmarks, an installed app's saved URL) are rewritten once at startup with
  `replaceState('#/x' → '/x')`.
- `base` is `'/'` (was `'./'`) and `index.html` links the favicon and touch icon root-absolute;
  relative asset URLs would resolve under the current path (`/accounts/assets/…`) on a deep link.
  The manifest keeps `id: './'`, `start_url`/`scope: '.'`: they resolve against
  `/manifest.webmanifest`, so the installed app's identity is unchanged.
- Offline, the service worker's `navigateFallback: 'index.html'` serves every path. Online without
  the worker (first visit, forced reload), the host must fall back to `index.html` for unknown
  paths (README → Hosting); Vite's dev and preview servers already do.

### D48. Deleting categories: only unused ones, like accounts

Users asked to delete categories, not only archive them. Same rule as accounts (D42): **a category
that no transaction and no recurring rule (including ended ones) uses can be deleted**; anything
else is archived. `CategoryService.remove` throws `InUseError` (`categoryInUse`); the Categories
page checks first and explains instead of offering the confirm dialog. Seeded categories can be
deleted too; seeding runs once per install and never overwrites a record in any state, so a
deleted seed stays deleted.

- **Budgets don't count as use.** A budget is a plan, not history: once its category is deleted,
  `BudgetService.forMonth` already skips it and recurring budgets are no longer copied forward
  (only listed categories are). The budget records stay, so a restored category gets them back.
- **Concurrent use** is handled like accounts: after every pull, `CategoryService.restoreUsed`
  writes `deleted: false` for each deleted category (still carrying its fields) that a visible
  transaction or rule uses. `TransactionRepository.hasAnyForCategory` walks the `categoryId`
  index.
- Deleting the category the transaction list is filtered by clears that filter.
