#!/usr/bin/env node
/**
 * Learnovize icon generator.
 *
 * The previous mark was a hard teal square with a generic notebook. It failed
 * for three reasons, all visible in a browser tab:
 *
 *  1. No rounded corners, so a favicon rendered as a hard square blob rather
 *     than reading as an app.
 *  2. A book is a notebook icon. Learnovize is live video teaching, and the mark
 *     said neither live nor video.
 *  3. At 16px the two pages collapsed into a smudge.
 *
 * So: a rounded teal tile, a play triangle that survives being tiny, and a
 * broadcast arc that says "live". The arc is dropped from the small sizes,
 * because detail that cannot survive being rendered should not be in the art.
 *
 * Run: node scripts/generate-icons.mjs
 */
import { mkdirSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, '..');
const publicDir = join(webRoot, 'public');

/* sharp is in the pnpm store but not linked at the workspace root. */
function loadSharp() {
  // walk up from apps/web to the workspace root that holds node_modules/.pnpm
  let dir = webRoot;
  for (let i = 0; i < 5; i++) {
    const store = join(dir, 'node_modules', '.pnpm');
    if (existsSync(store)) {
      const d = readdirSync(store).find((x) => x.startsWith('sharp@'));
      if (d) {
        const req = createRequire(join(store, d, 'node_modules', 'sharp', 'package.json'));
        const m = req('./dist/index.cjs');
        return m.default ?? m;
      }
    }
    dir = dirname(dir);
  }
  throw new Error('sharp not found in any node_modules/.pnpm above apps/web');
}
const sharp = loadSharp();

/* Brand ---------------------------------------------------------------- */
const TEAL_500 = '#1B7E8D';
const TEAL_600 = '#14616E';
const TEAL_800 = '#0A343C';
const WHITE = '#FFFFFF';

/**
 * The artwork on its own: play triangle plus live arcs, no background.
 *
 * Separated from the tile so a maskable icon can put it on a full-bleed
 * background. The first attempt reused the rounded tile inside a dark frame and
 * it read as a square sitting in a square once Android cropped it.
 */
function artwork({ live = true } = {}) {
  const cx = 244;
  const cy = 262;
  const h = 176;
  const w = 158;
  const play = `M ${cx - w / 2} ${cy - h / 2} L ${cx + w / 2} ${cy} L ${cx - w / 2} ${cy + h / 2} Z`;
  const arc = live
    ? `<g stroke="${WHITE}" stroke-width="26" stroke-linecap="round" fill="none">
        <path d="M 300 168 A 46 46 0 0 1 300 356" opacity="0.45"/>
        <path d="M 352 138 A 92 92 0 0 1 352 386" opacity="0.22"/>
      </g>`
    : '';
  return `<path d="${play}" fill="${WHITE}"/>${arc}`;
}

/** The mark, on a 512 grid. */
function svg({ size = 512, radius = 112, live = true, gradient = true } = {}) {
  const bg = gradient
    ? `<defs>
    <linearGradient id="g" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0%" stop-color="${TEAL_500}"/>
      <stop offset="55%" stop-color="${TEAL_600}"/>
      <stop offset="100%" stop-color="${TEAL_800}"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="${radius}" fill="url(#g)"/>`
    : `<rect width="512" height="512" rx="${radius}" fill="${TEAL_600}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  ${bg}
  ${artwork({ live })}
</svg>`;
}

/**
 * Maskable: full-bleed gradient, artwork inside the safe zone.
 *
 * Android crops this to whatever shape the launcher uses, so there is no tile
 * and no corner to be cut. The artwork is scaled to 62% because the safe zone is
 * a circle of 80% diameter and the corners of that circle are the first thing to
 * disappear.
 */
function maskableSvg(size = 512) {
  const inset = 0.62;
  const pad = (1 - inset) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="gm" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0%" stop-color="${TEAL_500}"/>
      <stop offset="55%" stop-color="${TEAL_600}"/>
      <stop offset="100%" stop-color="${TEAL_800}"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#gm)"/>
  <g transform="translate(${pad * 512} ${pad * 512}) scale(${inset})">${artwork({ live: true })}</g>
</svg>`;
}

/**
 * ICO with embedded PNGs.
 *
 * Every browser that still asks for favicon.ico wants one file holding several
 * sizes. ICO permits a PNG payload per entry, so there is no need for a BMP
 * encoder.
 */
function buildIco(entries) {
  const count = entries.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);            // reserved
  header.writeUInt16LE(1, 2);            // type: icon
  header.writeUInt16LE(count, 4);

  const dir = Buffer.alloc(16 * count);
  let offset = 6 + 16 * count;
  entries.forEach((e, i) => {
    const b = i * 16;
    dir.writeUInt8(e.size >= 256 ? 0 : e.size, b + 0);
    dir.writeUInt8(e.size >= 256 ? 0 : e.size, b + 1);
    dir.writeUInt8(0, b + 2);            // palette
    dir.writeUInt8(0, b + 3);            // reserved
    dir.writeUInt16LE(1, b + 4);         // colour planes
    dir.writeUInt16LE(32, b + 6);        // bits per pixel
    dir.writeUInt32LE(e.data.length, b + 8);
    dir.writeUInt32LE(offset, b + 12);
    offset += e.data.length;
  });

  return Buffer.concat([header, dir, ...entries.map((e) => e.data)]);
}

async function png(size, markup) {
  return sharp(Buffer.from(markup)).resize(size, size, { fit: 'cover' }).png({ compressionLevel: 9 }).toBuffer();
}

async function main() {
  mkdirSync(publicDir, { recursive: true });
  const written = [];
  const put = async (name, buf) => { writeFileSync(join(publicDir, name), buf); written.push([name, buf.length]); };

  // Master, for anyone who wants the vector.
  writeFileSync(join(publicDir, 'icon.svg'), svg({ size: 512 }), 'utf8');
  written.push(['icon.svg', Buffer.byteLength(svg({ size: 512 }))]);

  // Simplified favicon vector: no arc. At 16px the arc is noise.
  writeFileSync(join(publicDir, 'favicon.svg'), svg({ size: 64, radius: 14, live: false }), 'utf8');
  written.push(['favicon.svg', Buffer.byteLength(svg({ size: 64, radius: 14, live: false }))]);

  // Raster sizes.
  const detail = svg({ size: 512, radius: 112, live: true });
  const simple = svg({ size: 512, radius: 112, live: false });

  await put('icon-192.png', await png(192, detail));
  await put('icon-512.png', await png(512, detail));
  await put('apple-touch-icon.png', await png(180, svg({ size: 512, radius: 0, live: true })));
  await put('icon-maskable-512.png', await png(512, maskableSvg(512)));
  await put('favicon-32.png', await png(32, simple));

  // favicon.ico carrying 16, 32 and 48.
  const ico = buildIco([
    { size: 16, data: await png(16, simple) },
    { size: 32, data: await png(32, simple) },
    { size: 48, data: await png(48, simple) },
  ]);
  writeFileSync(join(publicDir, 'favicon.ico'), ico);
  written.push(['favicon.ico', ico.length]);

  console.log('  generated:');
  for (const [n, b] of written) console.log(`    ${n.padEnd(26)} ${String(b).padStart(7)} bytes`);

  /* ---------------------------------------------------------------- *
   * Android launcher icons.
   *
   * The TWA installs onto a home screen, so these are what people see on
   * their phone. Adaptive icons get their foreground inset by the launcher,
   * so the foreground is artwork-only on a transparent field -- the same
   * reason the maskable has no tile.
   * ---------------------------------------------------------------- */
  const androidRes = join(webRoot, '..', 'android', 'app', 'src', 'main', 'res');
  if (!existsSync(androidRes)) {
    console.log('\n  android/res not found, skipping launcher icons');
    return;
  }

  // Legacy launcher icons: full-bleed rounded tile.
  const legacy = { 'mipmap-mdpi': 48, 'mipmap-hdpi': 72, 'mipmap-xhdpi': 96, 'mipmap-xxhdpi': 144, 'mipmap-xxxhdpi': 192 };
  for (const [dir, px] of Object.entries(legacy)) {
    const d = join(androidRes, dir);
    if (!existsSync(d)) continue;
    writeFileSync(join(d, 'ic_launcher.png'), await png(px, detail));
    writeFileSync(join(d, 'ic_launcher_round.png'), await png(px, detail));
  }

  // Adaptive: 108dp canvas, artwork inside the inner 72dp safe zone.
  const adaptive = { 'mipmap-mdpi': 108, 'mipmap-hdpi': 162, 'mipmap-xhdpi': 216, 'mipmap-xxhdpi': 324, 'mipmap-xxxhdpi': 432 };
  const fgSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="108" height="108" viewBox="0 0 512 512">
  <g transform="translate(140 140) scale(0.45)">${artwork({ live: true })}</g>
</svg>`;
  const bgSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="108" height="108" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${TEAL_600}"/>
</svg>`;
  for (const [dir, px] of Object.entries(adaptive)) {
    const d = join(androidRes, dir);
    if (!existsSync(d)) continue;
    writeFileSync(join(d, 'ic_launcher_foreground.png'), await png(px, fgSvg));
    writeFileSync(join(d, 'ic_launcher_background.png'), await png(px, bgSvg));
  }

  console.log('\n  android launcher icons:');
  for (const dir of Object.keys(legacy)) {
    if (existsSync(join(androidRes, dir))) {
      console.log(`    ${dir.padEnd(26)} legacy + adaptive`);
    }
  }
}

await main();