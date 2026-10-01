# CLAUDE.md — rules for agent sessions in this repo

Local-first personal finance app: Preact + Signals + IndexedDB (`idb`), optional WebDAV sync,
shipped only as an installable, fully offline Vite PWA (no native shells, D35). Plain JavaScript (ES2022, ESM) with JSDoc types
checked by `tsc` (`checkJs`, `strict`). Read `docs/ARCHITECTURE.md` and `docs/SYNC_PROTOCOL.md`
before changing persistence or sync. Log every deviation or non-obvious decision in
`docs/DECISIONS.md`.

## Verification

```sh
npm run check        # format:check → lint → typecheck → test → build → verify:pwa; 0 errors, 0 warnings
npm run test         # vitest (node project: core/infrastructure/state/shared; dom project: tests/ui)
npm run lint:fix && npm run format
```

Tooling pins (see DECISIONS D1–D3): ESLint 9 (plugin compatibility), TypeScript 6.0, Vitest 5.
Tests mirror `src/` under `tests/`; helpers live in `tests/helpers/` (`testServices`,
`testStores`, `renderWithStores`, `InMemoryWebDav`, `simulatedDevice`, `FixedClock`).

Never disable a lint rule, add `@ts-ignore`, or skip a test to pass a gate. A single-line disable
needs a comment explaining why and an entry in `docs/DECISIONS.md`.

## Layers (dependencies point inward only)

```
ui ──► state ──► core (services ──► domain, ports)
                     ▲
infrastructure ──────┘ (implements core ports)
app/ = composition root (createContainer.js wires everything; only place with module-level mutable state)
shared/ = leaf utilities (debounce, assert, ChangeFeed); imports no other layer
```

| Files under             | May not import                                                            |
| ----------------------- | ------------------------------------------------------------------------- |
| `src/core/**`           | infrastructure, state, ui, app, `preact`, `@preact/signals(-core)`, `idb` |
| `src/infrastructure/**` | state, ui, app, `preact`, `@preact/signals`                               |
| `src/state/**`          | infrastructure, ui, app, `preact`, `@preact/signals`, `idb`               |
| `src/ui/**`             | infrastructure, core/services, app, `idb`, `@preact/signals-core`         |

Enforced by `no-restricted-imports` in `eslint.config.js`; `import-x/no-cycle` is on. `@capacitor/*`
is banned everywhere. No barrel
files — import each module from its own file, with the extension.

- `core/domain`: pure rules, factories, validators. No I/O, no system clock, no DOM.
- `core/ports`: JSDoc typedef contracts (repositories, clock, idGenerator, syncTransport,
  credentialStore, changeFeed).
- `core/services`: use cases; constructor-injected ports; throw typed errors from `core/errors.js`.
- `infrastructure`: IndexedDB repos, `ChangeRecorder`, sync engine, WebDAV client, platform.
- `state`: stores on `@preact/signals-core`; private writable signals, public `ReadonlySignal`
  getters, `computed()` for derived data, async actions updating signals in `batch()`, and
  `status`/`error` signals plus `invalidate()`.
- `ui`: pages (and a few feature containers: `TransactionDialog`, settings sections,
  `SyncIndicator`) call `useStores()`; forms are presentational. Shared form logic:
  `ui/hooks/useFormState.js` (draft signal, typed field errors, busy flag).
- `app`: `createContainer.js` builds infrastructure → services → stores, binds store
  invalidation to the change feed (`storeInvalidation.js`), starts sync/midnight timers.
- Store signals: `AccountsStore.items/active/archived/totals/byId`, `TransactionsStore.days/total`,
  `BudgetsStore.data/totals`, `SyncStore.syncStatus` (live sync state) + `config`.
- Feature folders: `ui/features/<feature>/` hold the page + feature-specific components. A
  component used by two or more features moves to `ui/components` and becomes feature-agnostic.

## Naming

A file is named exactly after its primary export. Components and class modules: PascalCase
(`TransactionForm.jsx`, `SyncEngine.js`). Function/constant/typedef modules: camelCase
(`money.js`). CSS Modules: `Component.module.css`. Tests: `<source>.test.js(x)` mirroring `src/`.
Folders: camelCase. Named exports only. Rename by case only with `git mv`.
Identifiers: PascalCase classes/components/typedefs, camelCase functions/variables/signals,
UPPER_SNAKE_CASE only for true constants, `onX` for callback props.

## Preact rules

- Function components, JSX only in `.jsx`, `className`, CSS Modules referencing tokens only.
- **Text inputs use `onInput`** (Preact `onChange` fires on blur); `onChange` only for
  select/checkbox/radio.
- Props down, `onX` callbacks up. Generic `ui/components` never call `useStores()`.
- `useEffect` only for DOM integration; `useSignalEffect` for reactive effects.
- Inline `style` only for CSS custom properties (`style={{ '--progress': ratio }}`).
- All strings via `t()`; money/dates via `Intl`. Every input has a `<label>`. Dialogs use native
  `<dialog>` + `showModal()` and restore focus.

## Signals rules

- Read `.value` only in render, `computed()`, or `effect()`; never snapshot into long-lived vars.
- Replace arrays/objects, never mutate. `batch()` multi-signal updates.
- Local component state: `useSignal`/`useComputed`. Shared state: stores only.
- One copy of `@preact/signals-core` (Vite `resolve.dedupe`); verify with `npm ls @preact/signals-core`.

## Domain rules

- Money: integer minor units + account currency code. Parse strings straight to minor units
  (`.` or `,`), reject excess decimals, never `parseFloat * 100`. Exponent from
  `Intl.NumberFormat(...).resolvedOptions().maximumFractionDigits`. Amounts are positive; sign
  comes from `kind` (income/expense/transfer).
- Dates: `'YYYY-MM-DD'` and `'YYYY-MM'` local strings; never timestamps. Audit fields
  (`createdAt`, `updatedAt`) are ISO UTC.
- **No stored aggregates**: balances and budget "spent" are computed from indexed queries.
- IDs: `crypto.randomUUID()` via injected generator; deterministic IDs where devices may create
  the same record: seeded categories `seed:<slug>`, budgets `<categoryId>:<YYYY-MM>`, recurring
  occurrences `<ruleId>:<YYYY-MM-DD>`.
- **Recurring rules are immutable** after creation except `endDate` and `deleted`. Editing = end the
  old rule the day before the effective date + create a new rule. Materialization (app start,
  after sync, local midnight) creates occurrences up to today, max 366 per rule per run, never
  rewrites an existing ID (even deleted), writes occurrences with the rule's creation clock, and
  deleting a rule keeps existing occurrences.
- v1 totals are grouped by currency (default EUR); no conversion.

## Sync invariants

- **Single writer per server folder**: a device writes only `devices/<ownDeviceId>/`.
- **Atomic write path**: every entity mutation goes through `ChangeRecorder` — one IDB transaction
  ticks the HLC, merges fields + `_clocks`, increments `localSeq`, appends the op to `outbox`; the
  change feed is published after commit. No other code writes entity stores.
- Per-field LWW merge on HLC strings (`merge.js`), commutative/associative/idempotent. Unknown
  fields are kept. Deletes are tombstones (`deleted: true`) and are hidden from queries.
- Push: segment PUT → head PUT → then remove from outbox. Pull: PROPFIND devices, GET heads, apply
  segments in order with cursor advance in one IDB transaction per segment. Pull then push, one
  cycle at a time.
- Never write to a vault whose `format` is newer than supported. Validate every downloaded file.
- Seeds use `SEED_HLC` (minimum clock); occurrences use the rule's `_clocks.createdAt`; backup
  import and vault switches replay records through `ChangeRecorder` with their original clocks.
- Transport: one adapter, `FetchHttpAdapter`, on every platform; the server needs CORS
  (DECISIONS D35). Platform detection (`detectPlatform`) only picks the default device name and
  install instructions, never features.
