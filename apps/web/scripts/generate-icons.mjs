/**
 * Generates the PWA icon set. Written as code rather than committed as binaries so the
 * mark, the colours and the sizes cannot drift apart, and so regenerating is one command.
 *
 * Uses zlib directly rather than an image library: the icons are flat shapes on a solid
 * background, and a dependency for that would be worse than the twenty lines below.
 */
import { deflateSync } from 'zlib';
import { writeFileSync } from 'fs';

const ACCENT = [0x1b, 0x7e, 0x8d];
const CREAM = [0xfb, 0xf6, 0xee];

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = c ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, pixel) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // truecolour with alpha
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y, size);
      raw[o++] = r; raw[o++] = g; raw[o++] = b; raw[o++] = a;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// An open book: two cream pages on the accent square, with a spine down the middle.
// Drawn with signed distances so it scales cleanly to every size in the manifest.
const book = (x, y, size) => {
  const u = (x / size) * 100;
  const v = (y / size) * 100;
  const inRounded = (px, py, r) => {
    const dx = Math.max(r - px, 0, px - (100 - r));
    const dy = Math.max(r - py, 0, py - (100 - r));
    return Math.hypot(dx, dy) <= r;
  };
  if (!inRounded(u, v, 22)) return [...ACCENT, 255];
  // Two pages either side of the spine.
  const leftPage = u >= 26 && u <= 48 && v >= 36 && v <= 66;
  const rightPage = u >= 52 && u <= 74 && v >= 36 && v <= 66;
  const spine = u >= 49 && u <= 51 && v >= 34 && v <= 68;
  if (leftPage || rightPage || spine) return [...CREAM, 255];
  return [...ACCENT, 255];
};

const OUT = 'C:/Users/DELL PC/Documents/QUBATORS/WUDI/apps/web/public/';
for (const size of [192, 512]) {
  writeFileSync(OUT + 'icon-' + size + '.png', png(size, book));
  console.log('  wrote icon-' + size + '.png');
}
// Maskable needs the mark inside the safe zone, so it uses a smaller glyph.
const mark = (x, y, size) => {
  const u = (x / size) * 100, v = (y / size) * 100;
  const left = u >= 32 && u <= 48 && v >= 38 && v <= 62;
  const right = u >= 52 && u <= 68 && v >= 38 && v <= 62;
  const spine = u >= 49 && u <= 51 && v >= 36 && v <= 64;
  if (left || right || spine) return [...CREAM, 255];
  return [...ACCENT, 255];
};
writeFileSync(OUT + 'icon-maskable-512.png', png(512, mark));
console.log('  wrote icon-maskable-512.png');
writeFileSync(OUT + 'apple-touch-icon.png', png(180, book));
console.log('  wrote apple-touch-icon.png');
