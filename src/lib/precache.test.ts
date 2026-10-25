import { describe, expect, it } from 'vitest';
import { precacheList, precacheVersion, serviceWorkerSource } from './precache';

describe('offline precache list', () => {
  const files = ['index.html', 'assets\\index-abc.js', 'assets/index-abc.js.map', 'assets/index-x.css', 'samples/piano/60.mp3', 'samples/manifest.json', 'manifest.webmanifest', 'icons/icon-192.png', 'sw.js', '.DS_Store'];
  it('keeps every app file (shell, assets, sound samples) and drops maps, the worker and hidden files', () => {
    const l = precacheList(files);
    expect(l).toContain('./');
    expect(l).toContain('./index.html');
    expect(l).toContain('./assets/index-abc.js');
    expect(l).toContain('./samples/piano/60.mp3');
    expect(l).toContain('./manifest.webmanifest');
    expect(l).not.toContain('./sw.js');
    expect(l.some((f) => f.endsWith('.map'))).toBe(false);
    expect(l.some((f) => f.includes('DS_Store'))).toBe(false);
    expect(l).toEqual([...l].sort());
  });
  it('a different set of files = a different cache version (old and new never mix)', () => {
    const a = precacheList(files);
    const b = precacheList([...files, 'assets/index-def.js']);
    expect(precacheVersion(a)).not.toBe(precacheVersion(b));
    expect(precacheVersion(a)).toBe(precacheVersion(a));
    expect(precacheVersion(a)).toMatch(/^soty-/);
  });
  it('the worker waits for "حدّثي" before taking over and only caches its own version', () => {
    const src = serviceWorkerSource(precacheList(files), 'soty-v1');
    expect(src).toContain('"soty-v1"');
    expect(src).toContain("e.data === 'skipWaiting'");
    const install = src.slice(src.indexOf("addEventListener('install'"), src.indexOf("addEventListener('activate'"));
    expect(install).not.toContain('skipWaiting');
    expect(src).toContain('./samples/piano/60.mp3');
    expect(src).toContain('ignoreVary: true');
  });
});
