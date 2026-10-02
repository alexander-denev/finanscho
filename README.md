# Finanscho

A local-first personal finance manager. Track accounts, transactions, monthly budgets, and
recurring payments. Everything works offline and is stored on your device; optionally, connect
your own WebDAV server (for example Nextcloud) to keep several devices in sync.

Finanscho is a single installable web app (PWA) for desktop, Android, and iOS. After the first
visit it works fully offline; install it to the home screen or desktop for the best protection of
your data.

- **Accounts**: cash, checking, savings, credit card, other; opening balance, color, archive.
- **Transactions**: expenses, income, transfers; filter by account, category, month, and text.
- **Budgets**: monthly limit per expense category, progress, "Copy last month's budgets".
- **Recurring**: daily/weekly/monthly/yearly rules; due transactions are created automatically.
- **Dashboard**: balances, totals per currency, this month's money in/out, budget status, the
  next 30 days.
- **Settings**: default currency, theme, device name, WebDAV sync, JSON backup export/import.

## Requirements

- Node.js 22.12+ or 24 LTS (the dev machine used Node 25; see `docs/DECISIONS.md`, D3)
- npm 10+

## Getting started

```sh
npm install
npm run dev        # http://localhost:5173
```

## Scripts

| Script               | What it does                                                     |
| -------------------- | ---------------------------------------------------------------- |
| `npm run dev`        | Vite dev server                                                  |
| `npm run build`      | Production build to `dist/` (with service worker and manifest)   |
| `npm run preview`    | Serve the production build                                       |
| `npm run lint`       | ESLint (includes the layer dependency rules)                     |
| `npm run format`     | Prettier (write); `format:check` only checks                     |
| `npm run typecheck`  | `tsc --noEmit` over JS with JSDoc types                          |
| `npm test`           | Vitest (Node project + DOM project); `test:watch` for watch mode |
| `npm run check`      | format check → lint → typecheck → test → build → verify:pwa      |
| `npm run verify:pwa` | Check the build's manifest, icons, and service worker precache   |

`npm run check` must pass with zero errors and zero warnings before any change is merged.

## Building

```sh
npm run build
npm run preview    # or deploy dist/ to any static host
```

The app uses path URLs (`/transactions`) and must be served from the root of its origin. Install it from
the browser's "Install app" menu (desktop and Android) or **Share → Add to Home Screen** (iPhone and
iPad); it works offline after the first visit.

### Hosting

Deploy `dist/` to the root (`/`) of any static host. For the offline app and updates to work reliably:

- **Serve `index.html` for unknown paths** (SPA fallback, e.g. nginx `try_files $uri /index.html`),
  so a first visit or a forced reload on a page such as `/accounts` works. Once the service worker
  is installed it answers these navigations itself.

- **Serve over HTTPS.** Service workers, installation, and persistent storage need a secure
  context (`http://localhost` is fine for testing).
- **Serve `sw.js` and `index.html` with `Cache-Control: no-cache`** so browsers always revalidate
  them and pick up new versions. Files under `assets/` have content hashes in their names and can
  be cached for a long time (`Cache-Control: public, max-age=31536000, immutable`).
- Serve `manifest.webmanifest` as `application/manifest+json`.
- Updates install in the background and apply silently on the next safe moment: never while a
  form is open or a sync is running.
- The WebDAV server is a different origin and must allow CORS (see
  [Server requirements](#server-requirements)). The service worker never caches WebDAV traffic.

`public/screenshots/` holds the install-sheet screenshots (real captures of the app with demo data).
They are listed in the manifest but not precached, because the app itself never loads them.

## Sync with WebDAV

Open **Settings → Sync**, enter:

- **Server URL**: your WebDAV base URL, e.g. `https://cloud.example.com/remote.php/dav/files/you`
- **Folder**: a folder just for Finanscho (default `finanscho`; created if missing)
- **Username / Password**: use an app password if your server supports them

Press **Test connection** (it never writes anything), then **Save and sync**. Every device writes
only to its own folder on the server, so devices can never overwrite each other's files. See
[`docs/SYNC_PROTOCOL.md`](docs/SYNC_PROTOCOL.md).

Each device compacts its history on the server automatically. **Settings → Devices** lists the
devices in the sync folder: remove one you no longer use (its data stays on your other devices),
or press **Clean up server data** to compact and delete old files now.

### Server requirements

- WebDAV with `GET`, `PUT`, `MKCOL`, `PROPFIND` (Depth 0 and 1), and `DELETE`, and HTTP Basic
  auth.
- HTTPS is strongly recommended (credentials are sent with every request).
- **CORS** (required on every platform, including iPhone): the server must allow cross-origin
  requests from the app's origin:
  - allowed origins: the origin you host Finanscho on;
  - allowed methods: `GET, PUT, PROPFIND, MKCOL, DELETE, OPTIONS` (without `DELETE` sync works, but
    old files are never cleaned up);
  - allowed headers: `Authorization, Content-Type, Depth, Cache-Control`;
  - `OPTIONS` preflight requests must succeed without authentication.

For local development against a server without CORS, create `.env.local` with
`WEBDAV_PROXY_TARGET=https://your-dav-server` and use `http://localhost:5173/webdav-proxy/<path>`
as the server URL while running `npm run dev`.

## Backups

**Settings → Backup → Export backup** downloads a JSON file with every record (including sync
metadata and deletions). Importing it into an empty install restores it exactly; importing into an
install with data merges it using the normal sync rules. Browsers may clear app storage when space
runs low, so enable sync or export backups regularly.

**Install the app** for the best protection: installed apps are much less likely to have their
storage cleared. Once you have data, Finanscho recommends installing it, and **Settings → App and
storage** shows whether your data is protected ("Protect my data" asks the browser). On iPhone and
iPad the home-screen app has its own storage, separate from Safari: export a backup first and
import it in the installed app, or use sync.

## Project layout

```
src/core            domain rules, ports, services (no I/O, no framework)
src/infrastructure  IndexedDB, write path, sync engine, WebDAV, platform
src/state           signal-based stores
src/ui              Preact components, pages, router, i18n, styles
src/app             composition root, app shell, routes
tests/              mirrors src/
docs/               architecture, conventions, sync protocol, design, decisions
```

Start with [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and [`CLAUDE.md`](CLAUDE.md).

## Known limitations (v1)

- **Sync needs CORS** on every platform, because the app talks to the WebDAV server with `fetch`
  (D35).
- No currency conversion: totals are grouped per currency. Budgets count spending in accounts of
  the budget's currency only.
- Credentials are stored in IndexedDB, the only durable storage a web app has (D35).
- Deleted records leave a small stub (about 150 bytes) forever, so other devices never resurrect
  them (D40). Each device's server log is compacted into checkpoints (D39).
- No CSV/OFX import, charts, or end-to-end encryption.
- English only (all strings are ready for translation in `src/ui/i18n/en.js`).
