# Coding conventions

These rules are enforced by ESLint, Prettier, and `tsc --noEmit` wherever possible. `npm run check`
must pass with zero errors and zero warnings.

## Naming

**A file is named exactly after its primary export.**

| Kind of file                                       | Case                                   | Examples                                         |
| -------------------------------------------------- | -------------------------------------- | ------------------------------------------------ |
| Preact component (`.jsx`)                          | PascalCase                             | `TransactionForm.jsx`, `AppShell.jsx`            |
| Module whose primary export is a class             | PascalCase                             | `TransactionService.js`, `SyncEngine.js`         |
| Module exporting functions, constants, or typedefs | camelCase                              | `money.js`, `localDate.js`, `createContainer.js` |
| CSS Module                                         | Component name + `.module.css`         | `TransactionForm.module.css`                     |
| Global stylesheet                                  | camelCase                              | `tokens.css`, `global.css`                       |
| Test                                               | Source file name + `.test.js`/`.jsx`   | `money.test.js`, `TransactionForm.test.jsx`      |
| Folder                                             | camelCase (single lowercase preferred) | `features/transactions`, `infrastructure/sync`   |

Tool-mandated config files and uppercase docs (`README.md`, `CLAUDE.md`, `docs/*.md`) are exempt.

- `unicorn/filename-case` allows only camelCase and PascalCase under `src/` and `tests/`.
- `import-x/no-unresolved` with `caseSensitiveStrict: true` fails on import paths whose case does
  not match the file on disk, even on case-insensitive file systems.
- Rename a file only by case with `git mv`.

Identifiers: `PascalCase` for classes, components, and typedefs; `camelCase` for functions,
variables, methods, and signals; `UPPER_SNAKE_CASE` only for true module-level constants. Callback
props are named `onSomething` (`onSave`, `onCancel`).

## JavaScript

- Named exports only; no default exports (config files excepted). No barrel `index.js` files.
- Relative imports include the file extension (`./money.js`).
- Services, repositories, stores, and infrastructure classes use private fields (`#field`,
  `#method()`) and expose the minimum public API.
- No module-level mutable state except in `src/app/createContainer.js`. Everything is injected.
- Every exported function, class, method, component, and typedef has JSDoc with parameter and
  return types. Components document props with a `@typedef` (e.g. `TransactionFormProps`).
- Keep files under roughly 300 lines.
- Services validate input with domain validators and throw typed errors from `core/errors.js`.
  The UI maps errors to i18n keys and never shows raw error text.
- All user-facing strings go through `t()`. Numbers, money, and dates use `Intl`.
- No `console.log`. Inject a logger if logging is needed.

## Preact

- Function components only; JSX only in `.jsx` files. Use `className`.
- Style with CSS Modules (`import styles from './X.module.css'`, `className={styles.root}`).
- **Text inputs use `onInput`, not `onChange`** (Preact's `onChange` fires on blur). Use `onChange`
  only for selects, checkboxes, and radios.
- Data flows down through props; events flow up through `onX` callbacks. Page components (and a few
  feature containers, see DECISIONS D25) call `useStores()`; generic components in
  `ui/components` never do.
- Avoid `useEffect` except for DOM integration (`showModal()`, focus). Use `useSignalEffect` for
  reactive side effects.
- Inline `style` only to pass dynamic values into CSS custom properties.

## Signals

- Read `.value` only inside a component render, a `computed()`, or an `effect()`. Never copy a
  signal's value into a long-lived variable.
- `const { items } = store` is fine (still a signal); `const items = store.items.value` at module
  level is not.
- Replace arrays and objects; never mutate them in place.
- Use `batch()` when an action updates several signals.
- Component-local state uses `useSignal`/`useComputed`. Shared state lives only in stores.
- Form drafts are local signals. Submitting calls a store action; typed validation errors are
  shown inline and linked with `aria-describedby`.
