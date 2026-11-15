// Component-test environment (jsdom): fake audio, mic, IndexedDB, Supabase, YouTube, fetch and timers.
// Every test starts from an empty device. See src/test/README.md for how to write one.

import 'fake-indexeddb/auto';
import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { audioControl, FakeAudioContext, FakeOfflineAudioContext } from './fakeAudio';
import { installFakeMic, mic } from './fakeMic';
import { server } from './fakeSupabase';
import { youtube, installFakeYouTube } from './fakeYouTube';
import { storageControl } from './storage';
import { installFakeMedia, media } from './fakeMedia';
import { installFakeSpeech, speech } from './fakeSpeech';
import { browser } from '../lib/reload';

// No test can reach her real Supabase project: the config and the client library are replaced.
vi.mock('../config/supabase', () => ({ SUPABASE_URL: 'https://fake.supabase.test', SUPABASE_ANON_KEY: 'sb_publishable_fake_key_for_tests_only', supabaseUrl: 'https://fake.supabase.test', supabaseKey: 'sb_publishable_fake_key_for_tests_only' }));
vi.mock('@supabase/supabase-js', async () => ({ createClient: (await import('./fakeSupabase')).createClient }));
// The pitch detector: a buffer the fake mic filled with a pure tone is answered from the tone itself (the same result
// real pitchy gives for it, much faster); everything else (song files, recordings) goes through real pitchy.
vi.mock('pitchy', async () => {
  const real = await vi.importActual<typeof import('pitchy')>('pitchy');
  const { micWave } = await import('./fakeAudio');
  return {
    ...real,
    PitchDetector: {
      forFloat32Array(n: number) {
        const d = real.PitchDetector.forFloat32Array(n);
        const findPitch = d.findPitch.bind(d);
        d.findPitch = (buf: ArrayLike<number>, sampleRate: number) => {
          const tone = micWave.get(buf as Float32Array);
          if (!tone) return findPitch(buf, sampleRate);
          const db = 20 * Math.log10(tone.level / Math.SQRT2);
          return db < d.minVolumeDecibels ? [0, 0] : [tone.freq, 0.99];
        };
        return d;
      },
    },
  };
});
vi.mock('../sync/supabaseBackend', async () => ({ BUCKET: 'soty-files', supabaseBackend: (await import('./fakeSupabase')).fakeBackend }));

// React's act() environment flag
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// Testing Library waits with its fake-timer path when it sees a jest-like global
(globalThis as { jest?: unknown }).jest = { advanceTimersByTime: (ms: number) => vi.advanceTimersByTime(ms) };

Object.assign(globalThis, { AudioContext: FakeAudioContext, webkitAudioContext: FakeAudioContext, OfflineAudioContext: FakeOfflineAudioContext });
installFakeMic();
installFakeYouTube();
installFakeMedia();
installFakeSpeech();

// small browser APIs jsdom doesn't have
window.matchMedia ??= ((q: string) => ({ matches: false, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as typeof window.matchMedia;
Element.prototype.scrollIntoView ??= function () {};
Element.prototype.scrollTo ??= function (this: Element, o?: ScrollToOptions | number) {
  if (typeof o === 'object' && o?.left !== undefined) (this as HTMLElement).scrollLeft = o.left;
};
window.scrollTo = (() => {}) as typeof window.scrollTo;
Element.prototype.setPointerCapture ??= function () {};
Element.prototype.releasePointerCapture ??= function () {};
URL.createObjectURL ??= () => 'blob:fake';
URL.revokeObjectURL ??= () => {};
Object.defineProperty(navigator, 'vibrate', { configurable: true, value: () => true });
Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => ({ release: async () => {}, addEventListener() {} }) } });
Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
HTMLMediaElement.prototype.play = function () {
  return Promise.resolve();
};
HTMLMediaElement.prototype.pause = function () {};
HTMLMediaElement.prototype.load = function () {};
class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= RO as unknown as typeof ResizeObserver;
globalThis.IntersectionObserver ??= RO as unknown as typeof IntersectionObserver;
HTMLCanvasElement.prototype.getContext = function () {
  const noop = () => {};
  return new Proxy({ measureText: () => ({ width: 10 }), createLinearGradient: () => ({ addColorStop: noop }), getImageData: () => ({ data: new Uint8ClampedArray(4) }) } as Record<string, unknown>, { get: (t, k: string) => (k in t ? t[k] : noop), set: () => true });
} as unknown as typeof HTMLCanvasElement.prototype.getContext;

/** Every request the app makes: sample files are "missing" (so the plain tone plays), the fake Supabase is reachable. */
export const requests: string[] = [];
globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
  const url = String(input instanceof Request ? input.url : input);
  requests.push(url);
  if (/supabase\.co\b/.test(url)) throw new Error('a test tried to reach the real Supabase: ' + url);
  if (url.includes('fake.supabase.test')) {
    if (!server.reachable) throw new TypeError('Failed to fetch');
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (url.endsWith('manifest.json')) return new Response('{}', { status: 404 });
  return new Response('not found', { status: 404, headers: { 'content-type': 'text/html' } });
}) as typeof fetch;

beforeEach(async () => {
  // an empty IndexedDB: the app's open connection closes itself on versionchange, so the delete goes through
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('soty');
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
  vi.setSystemTime(new Date('2026-11-15T09:00:00'));
  localStorage.clear();
  sessionStorage.clear();
  audioControl.reset();
  mic.reset();
  server.reset();
  youtube.reset();
  media.reset();
  speech.reset();
  storageControl.reset();
  requests.length = 0;
  vi.spyOn(browser, 'reload').mockImplementation(() => {});
  setVisibility('visible');
  window.location.hash = '';
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

export function setVisibility(v: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: v });
  Object.defineProperty(document, 'hidden', { configurable: true, value: v === 'hidden' });
}
