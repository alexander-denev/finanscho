# Architecture

Finanscho is a local-first personal finance app. All data lives in IndexedDB on the device; an
optional WebDAV server lets several devices exchange changes. It ships as one installable,
fully offline PWA for desktop, Android, and iOS (no native shells; DECISIONS D35).

## Layers

```
ui  ──►  state  ──►  core (services ──► domain, ports)
                          ▲
infrastructure ───────────┘   (implements core ports)

app/    composition root — the only module that knows every layer
shared/ leaf utilities (debounce, assert, ChangeFeed) — imports no other layer
```

Dependencies point inward only. `eslint.config.js` enforces this with `no-restricted-imports`
per folder, plus `import-x/no-cycle`:

| Files under             | May not import                                                            |
| ----------------------- | ------------------------------------------------------------------------- |
| `src/core/**`           | infrastructure, state, ui, app, `preact`, `@preact/signals(-core)`, `idb` |
| `src/infrastructure/**` | state, ui, app, `preact`, `@preact/signals`                               |
| `src/state/**`          | infrastructure, ui, app, `preact`, `@preact/signals`, `idb`               |
| `src/ui/**`             | infrastructure, core/services, app, `idb`, `@preact/signals-core`         |
| `src/shared/**`         | every other layer and framework package                                   |

`@capacitor/*` is banned in every file (D35).

### What lives where

| Folder                        | Contents                                                                                                                                                                                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/core/domain`             | Pure rules: money (minor units), local dates, entity factories/validators, recurrence schedule, automations (When/If/Do, result building). No I/O, no clock.                                                                                      |
| `src/core/ports`              | JSDoc contracts: repositories, clock, id generator, change feed, credential store, sync transport/control.                                                                                                                                        |
| `src/core/services`           | Use cases with constructor injection: accounts, categories, transactions, budgets, automations, dashboard, backup, settings.                                                                                                                      |
| `src/core/errors.js`          | Typed errors (`ValidationError`, `NotFoundError`, `BackupError`, `SyncError`) with stable codes for i18n.                                                                                                                                         |
| `src/infrastructure/db`       | `database.js` (schema + migrations), `ChangeRecorder` (the only entity writer), IndexedDB repositories, credential store.                                                                                                                         |
| `src/infrastructure/sync`     | `HybridLogicalClock`, `operation.js`, `deviceHead.js`, `merge.js` (pure LWW merge), `SyncEngine` (pull/push), `SyncScheduler` (triggers, backoff, status), `webdav/` (client, adapters).                                                          |
| `src/infrastructure/platform` | `platform.js` (OS/browser detection for device names and install help), `lifecycle.js` (resume/pause), `localMidnight.js`, `serviceWorker.js` (guarded updates), `BrowserInstallEnvironment` (install prompt, display mode, `navigator.storage`). |
| `src/state`                   | Stores on `@preact/signals-core`: private writable signals, public read-only getters, `computed()` views, async actions, `status`/`error`, `invalidate()`.                                                                                        |
| `src/ui`                      | Preact components. `components/` generic, `features/<name>/` pages and feature parts, `hooks/`, `router/`, `i18n/`, `styles/`.                                                                                                                    |
| `src/app`                     | `createContainer.js` wires everything; `App.jsx`, `AppShell.jsx`, `routes.js`, `storeInvalidation.js`.                                                                                                                                            |

## Data flow

### A local change

```
TransactionForm ──onSubmit──► TransactionsStore.save()
    ──► TransactionService.create()          validates with domain rules, throws ValidationError
    ──► IdbTransactionRepository.create()
    ──► ChangeRecorder.write()               one IndexedDB transaction:
                                              tick HLC → merge op into record (_clocks) → append to outbox
    ──► ChangeFeed.publish({ entities: ['transactions'], source: 'local' })   after commit
    ──► bindStoreInvalidation (app)          every store depending on 'transactions' → invalidate()
    ──► stores reload their bounded queries  → signals update → components re-render
    ──► SyncScheduler                         local change → sync 5 s later (debounced)
```

Validation errors travel back as `ValidationError.fields` (field → i18n key) and are shown inline
next to the field, linked with `aria-describedby`.

### A remote change

```
SyncScheduler ──► SyncEngine.sync()  (mutex; pull then push)
    pull: PROPFIND devices/ → GET head.json → GET segments → ChangeRecorder.applyRemote()
          (merge + cursor advance in one IndexedDB transaction per segment)
    ──► AccountService/CategoryService.restoreUsed()  deleted accounts and categories used again
                                          on another device come back
    ──► AutomationService.run({ events: transactions or automations arrived })
    ──► ChangeFeed.publish({ source: 'remote' })  → the same store invalidation path
    push: segment PUT → head PUT → outbox trim
    maintenance: compaction when due (checkpoint → trimmed head) → delete own superseded files
    device removal (user-confirmed): full pull → checkpoint → DELETE devices/<id>/
```

Stores never know about sync; they only react to the change feed.

## Derived data

Balances, budget spending, dashboard totals, and automations' next dates are always computed:

- account balance = opening balance + `netForAccount()` (streamed through the `accountId` and
  `toAccountId` indexes);
- budget spent = expenses from the `[categoryId+date]` index for the month, in the budget's
  currency;
- month flow = the month's transactions from the `[date+createdAt]` index, without transfers and
  balance adjustments (D49);
- reconciling compares with the balance through today: `netForAccount(id, today)` skips
  future-dated transactions.

Nothing aggregated is stored, so there is nothing to conflict during sync.

## Startup

`main.jsx` loads `registerSW` (production builds only) → `createContainer({ window, registerServiceWorker })`,
which first builds `BrowserInstallEnvironment` so an early `beforeinstallprompt` is not missed:

1. open IndexedDB (running migrations), get or create the device id, set a default device name;
2. build repositories and services;
3. replay deferred remote ops, seed default categories once, run automations (make what they owe
   since the app last ran);
4. build the sync scheduler (`fetch` on every platform) and the stores;
5. bind store invalidation and the debounced automation run after local transaction changes
   (`runAutomationsOnChange`), load all stores;
6. start the local-midnight timer (runs automations), ask for persistent storage where that never prompts
   (`InstallStore.protectSilently`, D38), start sync in the background;
7. register the service worker (`infrastructure/platform/serviceWorker.js`).

If IndexedDB cannot be opened (for example in some private windows), a plain explanation is shown.

### Installing and storage protection

IndexedDB is the only store, and browsers may evict it. Installed PWAs are far less likely to lose
data (Chromium grants `persist()` heuristically, Safari exempts home-screen apps from its 7-day
eviction), so the app recommends installing (D38):

- `core/ports/installEnvironment.js` describes the install prompt, display mode, platform, and
  `navigator.storage`; `BrowserInstallEnvironment` implements it; `InstallStore` observes it.
- `InstallBanner` (top of `<main>`) appears once the user has real data, unless installed or
  snoozed. `AppStorageSettings` (first in Settings) shows install status, storage protection,
  and space used. `InstallInstructionsDialog` (`ui/components`) gives per-browser steps, warns that
  an iOS home-screen app does not share Safari's storage, and offers "Export backup first".

### Offline and updates

A service worker (vite-plugin-pwa, `generateSW`) precaches every emitted file, so the app loads
and saves data with no network at all. Navigations fall back to `index.html`; WebDAV traffic is
cross-origin and never cached. `scripts/verifyPwaBuild.js` (part of `npm run check`) fails the
gate if a file escapes the precache or the manifest is incomplete (D37).

Updates are applied silently by `serviceWorker.js` (D36): when a new version is waiting, it
activates it and reloads only if no `<dialog>` is open and no sync cycle is running, or the page is
hidden. Otherwise it waits for a dialog `close`, a sync status change, or `visibilitychange`.
It checks for a new version hourly while visible. The first install is silent: no "works offline"
toast (D46).

## Sync

See [SYNC_PROTOCOL.md](SYNC_PROTOCOL.md) for the server layout, op format, HLC, merge rules,
deterministic IDs, crash safety, and transport details.

## UI

- History router (`/transactions`, `historyRouter.js`) built on a signal, created by the
  composition root. It handles plain same-origin link clicks in place and rewrites old hash links
  (`#/transactions`). The app is served from `/` (`base: '/'`); the service worker answers every
  navigation with `index.html`, and the host must do the same for a first visit or a forced reload
  on a deep path (D47).
- `AppShell`: bottom tab bar and floating "Add transaction" button below 1024 px; left sidebar
  from 1024 px (CSS only). Hosts the sync indicator and toasts; moves focus to `<main>` after
  navigation.
- Pages call `useStores()`; generic components in `ui/components` receive props only.
- Styling: CSS Modules referencing design tokens in `ui/styles/tokens.css` (see
  [DESIGN.md](DESIGN.md)); light and dark themes; `prefers-reduced-motion` respected.
- All strings go through `t()` (`ui/i18n/en.js`); money, dates, and relative times use `Intl`.

## Testing

| Project | Environment                 | Covers                                                                                               |
| ------- | --------------------------- | ---------------------------------------------------------------------------------------------------- |
| `node`  | Node + `fake-indexeddb`     | domain, services, repositories, ChangeRecorder, merge property tests, sync engine, scheduler, stores |
| `dom`   | happy-dom + Testing Library | generic components, router, i18n, app shell, and each page's main flow                               |

Sync tests use `tests/helpers/InMemoryWebDav.js`, a fake WebDAV server implementing the HTTP
adapter port, and simulate three devices with separate databases (scripted and randomized
histories, crashes between segment and head writes, duplicate delivery, malformed files, newer
vault formats). `WebDavClient.test.js` runs in the DOM environment for `DOMParser`.
