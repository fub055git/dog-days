// Draws the paw icon (same shapes as icon.svg) as PNGs, with no dependencies: node build-icons.mjs
// iPhone's "Add to Home Screen" ignores SVG icons, so it needs apple-touch-icon.png (180 px).
// Shapes are in icon.svg's 192-unit space; each pixel is 4×4 supersampled for smooth edges.
import fs from 'node:fs';
import zlib from 'node:zlib';

const BG = [0xc2, 0x66, 0x2d];
const PAW = [0xff, 0xff, 0xff];
const ELLIPSES = [[96, 122, 34, 28], [54, 86, 14, 18], [80, 60, 14, 19], [112, 60, 14, 19], [138, 86, 14, 18]];

const inEllipse = (x, y) => ELLIPSES.some(([cx, cy, rx, ry]) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1);
// iOS rounds the corners itself, so the home-screen icon is a full square; the browser icons get rx=40.
function inRoundRect(x, y, r) {
  if (!r) return x >= 0 && x <= 192 && y >= 0 && y <= 192;
  const cx = Math.min(Math.max(x, r), 192 - r), cy = Math.min(Math.max(y, r), 192 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function render(size, radius) {
  const S = 4, px = Buffer.alloc(size * size * 4);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    let bg = 0, paw = 0;
    for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
      const x = ((i + (sx + 0.5) / S) / size) * 192, y = ((j + (sy + 0.5) / S) / size) * 192;
      if (!inRoundRect(x, y, radius)) continue;
      if (inEllipse(x, y)) paw++; else bg++;
    }
    const a = (bg + paw) / (S * S), o = (j * size + i) * 4;
    for (let c = 0; c < 3; c++) px[o + c] = a ? Math.round((BG[c] * bg + PAW[c] * paw) / (bg + paw)) : 0;
    px[o + 3] = Math.round(a * 255);
  }
  return encodePNG(size, px);
}

// Minimal PNG writer: 8-bit RGBA, filter 0 on every row.
const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePNG(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const out = [['apple-touch-icon.png', 180, 0], ['icon-192.png', 192, 40], ['icon-512.png', 512, 40]];
for (const [name, size, r] of out) {
  fs.writeFileSync(new URL(name, import.meta.url), render(size, r));
  console.log(name, size + 'px');
}
