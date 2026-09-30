/**
 * Generates the app icons (PNG + SVG) from simple geometry, without extra dependencies.
 * Run with `node scripts/generateIcons.js`. Output goes to `public/`.
 *
 * Design: a paper ledger page with ruled lines and a brass coin on a pine background. All shapes
 * sit inside the central 80% so the icon is safe as a maskable icon.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const PINE = [0x1f, 0x4a, 0x45];
const PAPER = [0xf6, 0xf3, 0xec];
const BRASS = [0xe2, 0xb4, 0x5c];

/** Shapes in unit coordinates (0..1), painted in order. */
const SHAPES = [
  { type: 'rect', x0: 0.27, y0: 0.2, x1: 0.73, y1: 0.8, r: 0.05, color: PAPER },
  { type: 'rect', x0: 0.34, y0: 0.35, x1: 0.66, y1: 0.39, r: 0.02, color: PINE },
  { type: 'rect', x0: 0.34, y0: 0.47, x1: 0.66, y1: 0.51, r: 0.02, color: PINE },
  { type: 'rect', x0: 0.34, y0: 0.59, x1: 0.52, y1: 0.63, r: 0.02, color: PINE },
  { type: 'circle', cx: 0.66, cy: 0.68, r: 0.11, color: BRASS },
];

function insideRect(s, x, y) {
  if (x < s.x0 || x > s.x1 || y < s.y0 || y > s.y1) return false;
  const cx = Math.min(Math.max(x, s.x0 + s.r), s.x1 - s.r);
  const cy = Math.min(Math.max(y, s.y0 + s.r), s.y1 - s.r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= s.r ** 2;
}

function colorAt(x, y) {
  let color = PINE;
  for (const s of SHAPES) {
    const hit =
      s.type === 'rect' ? insideRect(s, x, y) : (x - s.cx) ** 2 + (y - s.cy) ** 2 <= s.r ** 2;
    if (hit) color = s.color;
  }
  return color;
}

function render(size) {
  const samples = 4;
  const rows = [];
  for (let py = 0; py < size; py += 1) {
    const row = Buffer.alloc(1 + size * 3);
    for (let px = 0; px < size; px += 1) {
      const sum = [0, 0, 0];
      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const c = colorAt((px + (sx + 0.5) / samples) / size, (py + (sy + 0.5) / samples) / size);
          for (let i = 0; i < 3; i += 1) sum[i] += c[i];
        }
      }
      for (let i = 0; i < 3; i += 1) row[1 + px * 3 + i] = Math.round(sum[i] / samples ** 2);
    }
    rows.push(row);
  }
  return Buffer.concat(rows);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function png(size) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // truecolor RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(render(size), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function hex(color) {
  return `#${color.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

function svg() {
  const parts = SHAPES.map((s) =>
    s.type === 'rect'
      ? `<rect x="${s.x0 * 64}" y="${s.y0 * 64}" width="${(s.x1 - s.x0) * 64}" height="${(s.y1 - s.y0) * 64}" rx="${s.r * 64}" fill="${hex(s.color)}"/>`
      : `<circle cx="${s.cx * 64}" cy="${s.cy * 64}" r="${s.r * 64}" fill="${hex(s.color)}"/>`,
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${hex(PINE)}"/>${parts.join('')}</svg>\n`;
}

mkdirSync('public', { recursive: true });
writeFileSync('public/favicon.svg', svg());
for (const [name, size] of [
  ['pwa-192x192.png', 192],
  ['pwa-512x512.png', 512],
  ['apple-touch-icon.png', 180],
  ['icon-1024.png', 1024],
]) {
  writeFileSync(`public/${name}`, png(size));
}
