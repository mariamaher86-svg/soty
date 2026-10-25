// Draws the app icon (a white microphone on purple) as PNG files, no image libraries needed.
// Run once: node scripts/make-icons.mjs
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

function icon(size, maskable) {
  const px = Buffer.alloc((size * 4 + 1) * size);
  const s = size / 512;
  const pad = maskable ? 0 : 0; // full-bleed background (iOS rounds the corners itself)
  for (let y = 0; y < size; y++) {
    px[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const X = x / s, Y = y / s;
      let r = 109, g = 75, b = 216, a = 255; // #6d4bd8
      // soft lighter circle
      if ((X - 256) ** 2 + (Y - 230) ** 2 < 190 ** 2) { r = 124; g = 92; b = 224; }
      const white = () => { r = 255; g = 255; b = 255; };
      // mic capsule
      if (Math.abs(X - 256) < 60 && Y > 120 && Y < 300) { if (Y < 180 ? (X - 256) ** 2 + (Y - 180) ** 2 < 60 ** 2 : Y < 240 || (X - 256) ** 2 + (Y - 240) ** 2 < 60 ** 2) white(); }
      // holder arc
      const d = Math.sqrt((X - 256) ** 2 + (Y - 250) ** 2);
      if (Y > 250 && d > 92 && d < 110) white();
      if (Math.abs(X - 256) < 10 && Y > 355 && Y < 410) white(); // stand
      if (Math.abs(Y - 410) < 10 && Math.abs(X - 256) < 60) white(); // base
      const o = y * (size * 4 + 1) + 1 + x * 4;
      px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(px)), chunk('IEND', Buffer.alloc(0))]);
}
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) writeFileSync(new URL(`../public/icons/${name}`, import.meta.url), icon(size));
console.log('icons written');
