// The app icon ("النغمة"): writes the two SVG masters and renders every PNG from them.
//   npm run icons
// The PNGs are committed, so the build never needs this script.
//
// icon.svg          — "any": the design at full size on a full-bleed square (iOS and Android round the corners).
// icon-maskable.svg — "maskable": the same drawing at 80% so the curve and the dot stay inside Android's safe circle
//                     (radius 40% of the icon) whatever shape the launcher cuts.

import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { Resvg } from '@resvg/resvg-js';

const OUT = 'public/icons';

/** The drawing on a 200×200 tile; `scale` shrinks the staff and melody around the centre (the background stays full). */
export function iconSvg(scale = 1) {
  const t = scale === 1 ? '' : ` transform="translate(100 100) scale(${scale}) translate(-100 -100)"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1b1f4b"/>
      <stop offset="1" stop-color="#3a2a6e"/>
    </linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#ffd27a"/>
      <stop offset="1" stop-color="#ffb347"/>
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  <rect width="200" height="200" fill="url(#bg)"/>
  <g${t}>
    <g stroke="#ffffff" stroke-opacity="0.12" stroke-width="2">
      <line x1="30" y1="70" x2="170" y2="70"/>
      <line x1="30" y1="95" x2="170" y2="95"/>
      <line x1="30" y1="120" x2="170" y2="120"/>
      <line x1="30" y1="145" x2="170" y2="145"/>
    </g>
    <path d="M30 150 C 60 150, 62 110, 90 112 S 120 70, 140 78 S 160 60, 170 58" fill="none" stroke="url(#gold)" stroke-width="10" stroke-linecap="round" filter="url(#glow)"/>
    <circle cx="170" cy="58" r="11" fill="#ffffff" filter="url(#glow)"/>
  </g>
</svg>
`;
}

export const MASKABLE_SCALE = 0.8;

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** An opaque RGB PNG (colour type 2, no alpha channel: iOS wants that for the home-screen icon). */
function rgbPng(width, height, rgba) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0; // no filter
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const o = y * (width * 3 + 1) + 1 + x * 3;
      raw[o] = rgba[i];
      raw[o + 1] = rgba[i + 1];
      raw[o + 2] = rgba[i + 2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/** Renders an SVG to an opaque PNG of `size`×`size` (on the icon's dark colour, so nothing is transparent). */
function png(svg, size) {
  const img = new Resvg(svg, { fitTo: { mode: 'width', value: size }, background: '#1b1f4b' }).render();
  return rgbPng(img.width, img.height, img.pixels);
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('make-icons.mjs')) {
  mkdirSync(OUT, { recursive: true });
  const any = iconSvg(1);
  const maskable = iconSvg(MASKABLE_SCALE);
  writeFileSync(`${OUT}/icon.svg`, any);
  writeFileSync(`${OUT}/icon-maskable.svg`, maskable);
  const files = {
    'apple-touch-icon.png': [any, 180],
    'icon-192.png': [any, 192],
    'icon-512.png': [any, 512],
    'icon-maskable-192.png': [maskable, 192],
    'icon-maskable-512.png': [maskable, 512],
    'favicon.png': [any, 32],
  };
  for (const [name, [svg, size]] of Object.entries(files)) {
    writeFileSync(`${OUT}/${name}`, png(svg, size));
    console.log(`${OUT}/${name} ${size}×${size}`);
  }
}
