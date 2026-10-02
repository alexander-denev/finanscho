/**
 * Verifies the production build is a complete, installable, offline-capable PWA. Run after
 * `vite build` (it is part of `npm run check`). Fails when:
 *
 * - `dist/manifest.webmanifest` lacks a required field, icon, or screenshot, or references a file
 *   that was not emitted (PNG sizes are checked against the declared `sizes`);
 * - `dist/index.html` does not link the manifest or the Apple touch icon;
 * - any emitted file is missing from the service worker precache. The only exceptions are
 *   `sw.js`, the workbox runtime, and the install-sheet screenshots the manifest lists, which the
 *   app itself never loads.
 *
 * See docs/DECISIONS.md, D41.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const DIST = 'dist';

/** @type {string[]} */
const failures = [];

/**
 * @param {boolean} condition
 * @param {string} message
 */
function expect(condition, message) {
  if (!condition) failures.push(message);
}

/**
 * Every file under `dir`, as `/`-separated paths relative to DIST.
 * @param {string} dir
 * @returns {string[]}
 */
function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [relative(DIST, path).split(sep).join('/')];
  });
}

/**
 * Width and height from a PNG's IHDR chunk, or null when the file is not a PNG.
 * @param {string} path
 * @returns {{ width: number, height: number } | null}
 */
function pngSize(path) {
  const bytes = readFileSync(path);
  if (bytes.length < 24 || bytes.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/**
 * Checks that a manifest image entry points at an emitted PNG of the declared size.
 * @param {{ src?: string, sizes?: string, type?: string }} entry
 * @param {string} label
 */
function checkImage(entry, label) {
  const src = entry.src ?? '';
  const path = join(DIST, src);
  if (!existsSync(path)) {
    failures.push(`${label} ${src} was not emitted`);
    return;
  }
  if (entry.type !== 'image/png') return;
  const size = pngSize(path);
  expect(size !== null, `${label} ${src} is not a PNG`);
  if (size) {
    expect(
      entry.sizes === `${size.width}x${size.height}`,
      `${label} ${src} declares ${entry.sizes} but is ${size.width}x${size.height}`,
    );
  }
}

if (!existsSync(join(DIST, 'sw.js'))) {
  failures.push('dist/sw.js is missing: run `vite build` first');
} else {
  // --- Manifest -------------------------------------------------------------------------------
  const manifest = JSON.parse(readFileSync(join(DIST, 'manifest.webmanifest'), 'utf8'));
  for (const field of [
    'id',
    'name',
    'short_name',
    'start_url',
    'scope',
    'lang',
    'theme_color',
    'background_color',
  ]) {
    expect(typeof manifest[field] === 'string' && manifest[field] !== '', `manifest.${field}`);
  }
  expect(manifest.display === 'standalone', 'manifest.display must be standalone');
  /** @type {Array<{ src?: string, sizes?: string, type?: string, purpose?: string }>} */
  const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
  for (const size of ['192x192', '512x512']) {
    expect(
      icons.some((i) => i.sizes === size && (i.purpose ?? 'any').split(' ').includes('any')),
      `manifest needs a ${size} icon with purpose "any"`,
    );
  }
  expect(
    icons.some((i) => (i.purpose ?? '').split(' ').includes('maskable')),
    'manifest needs a maskable icon',
  );
  for (const icon of icons) checkImage(icon, 'icon');

  /** @type {Array<{ src?: string, sizes?: string, type?: string, form_factor?: string }>} */
  const screenshots = Array.isArray(manifest.screenshots) ? manifest.screenshots : [];
  for (const formFactor of ['narrow', 'wide']) {
    expect(
      screenshots.some((s) => s.form_factor === formFactor),
      `manifest needs a ${formFactor} screenshot`,
    );
  }
  for (const shot of screenshots) checkImage(shot, 'screenshot');

  // --- index.html -----------------------------------------------------------------------------
  const html = readFileSync(join(DIST, 'index.html'), 'utf8');
  expect(/<link rel="manifest" href="\/manifest\.webmanifest"/.test(html), 'manifest link');
  expect(/<link rel="apple-touch-icon" href="\/apple-touch-icon\.png"/.test(html), 'touch icon');

  // --- Precache completeness ------------------------------------------------------------------
  const sw = readFileSync(join(DIST, 'sw.js'), 'utf8');
  const precached = new Set([...sw.matchAll(/\{url:"([^"]+)",revision:/g)].map((m) => m[1]));
  expect(precached.size > 0, 'could not read the precache list from dist/sw.js');
  const installSheetOnly = new Set(screenshots.map((s) => s.src));
  for (const file of walk(DIST)) {
    if (file === 'sw.js' || /^workbox-[\w-]+\.js$/.test(file)) continue;
    if (installSheetOnly.has(file)) {
      expect(!precached.has(file), `${file} is install-sheet only and should not be precached`);
      continue;
    }
    expect(precached.has(file), `${file} is not in the service worker precache`);
  }
  expect(precached.has('index.html'), 'index.html must be precached for the navigation fallback');
}

if (failures.length > 0) {
  for (const failure of failures) process.stderr.write(`verifyPwaBuild: ${failure}\n`);
  process.exit(1);
}
process.stdout.write('verifyPwaBuild: manifest, icons, screenshots, and precache are complete\n');
