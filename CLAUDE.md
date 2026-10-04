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
  `BudgetsStore.data/totals`, `SyncStore.syncStatus` (live sync state) + `config`,
  `InstallStore.installed/canPrompt/guidance/persisted/showBanner` (install + storage protection).
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
- **Recurring rules are immutable** after creation except `endDate` and `deleted`. Changing the
  template or cadence = end the old rule the day before the effective date + create a new rule
  with `previousRuleId` (the list hides replaced rules). Stop, resume, and date-only edits change
  `endDate` in place; dates skipped while stopped are written as tombstones first (D44).
  Materialization (app start, after sync, local midnight) creates occurrences up to today, max 366
  per rule per run, never rewrites an existing ID (even deleted; found by the `<ruleId>:` key
  prefix), writes occurrences with the rule's creation clock, and deleting a rule keeps existing
  occurrences.
- **Recurring budgets** (`recurring: true`) are copied forward month by month up to the current
  month with the source's clock, stopping at any month that has a record in any state (D43).
- Accounts and categories can be deleted only when no transaction or rule uses them; after a
  pull, deleted ones that are used again are restored (D42, D48). Income and expenses may be
  uncategorized.
- v1 totals are grouped by currency (default EUR); no conversion.

## Sync invariants

- **Single writer per server folder**: a device writes only `devices/<ownDeviceId>/`. Sole
  exception: user-confirmed device removal deletes another device's folder after publishing a
  checkpoint that contains its data (SYNC_PROTOCOL §11, D41).
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
- **Compaction** (SYNC_PROTOCOL §10, D39): a device re-queues its full state as a checkpoint
  (`queueCheckpoint`, empty outbox only), publishes it, trims its own head to the checkpoint, and
  deletes its own superseded files. Readers below a checkpoint just apply it; the frontier raises
  other cursors in the same IDB transaction. The vault format stays 1. Cleanup failures are never
  sync errors (`cleanupBlocked`).
- **Tombstone stubs** (D40): a stub keeps `id`, `deleted`, `updatedAt` and fields newer than the
  delete. Checkpoints publish stubs; `pruneTombstones` shrinks 30-day-old tombstones locally.
  Stubs are never purged.
- Transport: one adapter, `FetchHttpAdapter`, on every platform; the server needs CORS
  (DECISIONS D35). Platform detection (`detectPlatform`) only picks the default device name and
  install instructions, never features.

## Communication Style

- Use plain language. Prefer everyday words over technical jargon. When a
  technical term is truly needed, explain it in a few words the first time
  you use it.
- Never refer to something only by a label, number or shorthand I may not
  remember (for example "§10.6", "hard rule 3", "the snapshot"). Say what it
  is, e.g. "open question 10.6 in CLAUDE.md: what happens to a machine's
  existing incidents when it moves to another folder".
- When asking me to decide something, give enough background that I can
  decide without opening another file: what the problem is, what each option
  means in practice, what it costs, and which one you recommend and why.
- Keep sentences short. One idea per bullet.