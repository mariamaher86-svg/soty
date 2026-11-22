// The home-screen icon: the manifest and the page head point at real files of the right size, the iOS icon has no
// alpha channel, and the offline cache picks the icons up (with a new version, so an installed app gets them).
import { describe, expect, it } from 'vitest';
import { precacheList, precacheVersion } from './precache';
import html from '../../index.html?raw';

// everything in public/ (through Vite, so no Node file APIs are needed)
const publicFiles = Object.keys(import.meta.glob('/public/**/*', { query: '?url', import: 'default', eager: true })).map((k) => k.replace(/^\/public\//, ''));
const pngs = import.meta.glob('/public/icons/*.png', { query: '?inline', import: 'default', eager: true }) as Record<string, string>;
const svgs = import.meta.glob('/public/icons/*.svg', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const manifestRaw = Object.values(import.meta.glob('/public/manifest.webmanifest', { query: '?raw', import: 'default', eager: true }))[0] as string;

const exists = (f: string) => publicFiles.includes(f);

function bytes(f: string): Uint8Array {
  const data = pngs['/public/' + f];
  expect(data, f).toBeTruthy();
  const bin = atob(data.slice(data.indexOf(',') + 1));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** Width, height and colour type from a PNG's IHDR chunk. */
function pngInfo(f: string) {
  const b = bytes(f);
  expect([...b.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(String.fromCharCode(...b.subarray(12, 16))).toBe('IHDR');
  const u32 = (o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
  return { width: u32(16), height: u32(20), colorType: b[25] };
}

const manifest = JSON.parse(manifestRaw) as {
  icons: { src: string; sizes: string; type: string; purpose: string }[];
  theme_color: string;
  background_color: string;
  short_name: string;
};

describe('app icon', () => {
  it('every manifest icon exists and a PNG is really the size it says', () => {
    for (const icon of manifest.icons) {
      expect(exists(icon.src), icon.src).toBe(true);
      if (icon.type !== 'image/png') continue;
      const [w, h] = icon.sizes.split('x').map(Number);
      expect(pngInfo(icon.src), icon.src).toMatchObject({ width: w, height: h });
    }
  });

  it('"any" and "maskable" are separate files, both at 192 and 512', () => {
    for (const icon of manifest.icons) expect(icon.purpose.split(' ')).toHaveLength(1);
    for (const purpose of ['any', 'maskable'])
      for (const size of ['192x192', '512x512']) expect(manifest.icons.some((i) => i.purpose === purpose && i.sizes === size && i.type === 'image/png'), `${purpose} ${size}`).toBe(true);
    const any = manifest.icons.find((i) => i.purpose === 'any' && i.sizes === '512x512')!.src;
    const mask = manifest.icons.find((i) => i.purpose === 'maskable' && i.sizes === '512x512')!.src;
    expect(pngs['/public/' + any]).not.toBe(pngs['/public/' + mask]); // the maskable one has more room
  });

  it('the iOS icon is 180×180 with no alpha channel, and every PNG is opaque', () => {
    expect(pngInfo('icons/apple-touch-icon.png')).toEqual({ width: 180, height: 180, colorType: 2 });
    for (const f of publicFiles.filter((x) => x.startsWith('icons/') && x.endsWith('.png'))) expect([0, 2], f).toContain(pngInfo(f).colorType);
  });

  it('the page head points at the new icons, and the name on the home screen is صوتي', () => {
    for (const m of html.matchAll(/<link rel="(?:icon|apple-touch-icon)"[^>]*href="\.\/([^"]+)"/g)) expect(exists(m[1]), m[1]).toBe(true);
    expect(html).toContain('href="./icons/apple-touch-icon.png"');
    expect(html).toContain('href="./icons/favicon.png"');
    expect(html).toContain('<meta name="apple-mobile-web-app-title" content="صوتي" />');
    expect(html).not.toContain('🎤');
    expect(manifest.short_name).toBe('صوتي');
    expect(manifest.background_color).toBe('#1b1f4b'); // the splash matches the icon
  });

  it('the SVG masters are full-bleed squares (no rounded corners: the phone masks the shape)', () => {
    for (const f of ['icon.svg', 'icon-maskable.svg']) {
      const svg = svgs['/public/icons/' + f];
      expect(svg).toContain('viewBox="0 0 200 200"');
      expect(svg).toMatch(/<rect width="200" height="200" fill="url\(#bg\)"\/>/);
      expect(svg).not.toMatch(/\brx=/);
    }
    expect(svgs['/public/icons/icon-maskable.svg']).toContain('scale(0.8)');
  });

  it('the offline cache includes every icon, and its version changes when files change', () => {
    const list = precacheList(publicFiles);
    for (const icon of manifest.icons) expect(list, icon.src).toContain('./' + icon.src);
    expect(list).toContain('./icons/apple-touch-icon.png');
    expect(list).toContain('./icons/favicon.png');
    const without = list.filter((f) => !f.includes('maskable'));
    expect(precacheVersion(list, 'x')).not.toBe(precacheVersion(without, 'x'));
  });
});
