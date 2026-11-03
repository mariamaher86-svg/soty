import { afterEach, describe, expect, it, vi } from 'vitest';
import { CurveLog, minMax, packCurve, pushCapped, thinPoints, unpackCurve } from './curveCap';
import { checkLastRun, clearAlive, cleanMessage, formatReport, logError, markAlive, MAX_LOG, pageName, readLog } from './errorLog';
import { compareCurves, type PitchPoint } from './compare';
import { extractPitchCurve } from './pitchTrack';
import { addResult, flushPendingResult, getResults, savePendingResult } from './storage';
import { midiToFreq } from './music';

const memStore = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
};

describe('live logs cannot grow without limit', () => {
  it('60 readings a second become about 20; an hour of singing stays under the cap', () => {
    const log = new CurveLog<PitchPoint>();
    for (let i = 0; i < 600; i++) log.add({ t: i / 60, freq: 220 });
    expect(log.length).toBeGreaterThanOrEqual(190);
    expect(log.length).toBeLessThanOrEqual(201);
    const long = new CurveLog<PitchPoint>(0.05, 1000);
    for (let i = 0; i < 60 * 3600; i++) long.add({ t: i / 60, freq: 220 });
    expect(long.length).toBeLessThanOrEqual(1000);
    expect(long.points[long.length - 1].t).toBeGreaterThan(3590);
    long.clear();
    expect(long.length).toBe(0);
    expect(long.add({ t: 0, freq: 1 })).toBe(true);
  });
  it('scoring gives the same answer with the lighter log', () => {
    const ref: PitchPoint[] = Array.from({ length: 500 }, (_, i) => ({ t: i * 0.02, freq: midiToFreq(60 + (i % 50 < 25 ? 0 : 2)) }));
    const full: PitchPoint[] = [];
    const light = new CurveLog<PitchPoint>();
    for (let i = 0; i < 600; i++) {
      const t = i / 60;
      const p = { t, freq: midiToFreq(60 + (Math.floor(t / 0.02) % 50 < 25 ? 0 : 2)) };
      full.push(p);
      light.add(p);
    }
    expect(Math.abs(compareCurves(light.points, ref).score - compareCurves(full, ref).score)).toBeLessThanOrEqual(5);
  });
  it('repeat scores are capped', () => {
    let s: number[] = [];
    for (let i = 0; i < 500; i++) s = pushCapped(s, i);
    expect(s).toHaveLength(200);
    expect(s[199]).toBe(499);
  });
});

describe('graphs draw a bounded number of points', () => {
  it('thins evenly, keeping both ends', () => {
    const list = Array.from({ length: 100000 }, (_, i) => i);
    const t = thinPoints(list, 2000);
    expect(t).toHaveLength(2000);
    expect(t[0]).toBe(0);
    expect(t[1999]).toBe(99999);
    expect(thinPoints([1, 2, 3], 2000)).toEqual([1, 2, 3]);
  });
  it('min/max of a list too long for Math.min(...list)', () => {
    const list = Array.from({ length: 500000 }, (_, i) => i - 5);
    expect(minMax(list)).toEqual({ min: -5, max: 499994 });
    expect(minMax([])).toBeNull();
  });
});

describe('the song curve cache', () => {
  it('packs into one typed array and comes back the same (silences too)', () => {
    const curve: PitchPoint[] = Array.from({ length: 1000 }, (_, i) => ({ t: 0.023 + i * 0.02, freq: i % 7 === 0 ? null : 220 + i / 10 }));
    const p = packCurve(curve);
    expect(p.freqs.byteLength).toBe(4000);
    const back = unpackCurve(p);
    expect(back).toHaveLength(1000);
    back.forEach((b, i) => {
      expect(b.t).toBeCloseTo(curve[i].t, 5);
      if (curve[i].freq === null) expect(b.freq).toBeNull();
      else expect(b.freq!).toBeCloseTo(curve[i].freq!, 2);
    });
    expect(unpackCurve(packCurve([]))).toEqual([]);
  });
  it('analysing at half the sample rate (half the memory) reads the same notes', async () => {
    const tone = (sr: number) => {
      const s = new Float32Array(sr * 2);
      let ph = 0;
      s.forEach((_, i) => {
        ph += (2 * Math.PI * (i < sr ? 220 : midiToFreq(69 + 3.5))) / sr; // a note, then one on a quarter tone
        s[i] = 0.5 * Math.sin(ph);
      });
      return s;
    };
    const full = await extractPitchCurve(tone(44100), 44100);
    const half = await extractPitchCurve(tone(22050), 22050, { windowSize: 1024 });
    for (const t of [0.5, 1.5]) {
      const a = full.find((p) => p.t >= t)!.freq!;
      const b = half.find((p) => p.t >= t)!.freq!;
      expect(Math.abs(1200 * Math.log2(a / b))).toBeLessThan(3); // cents
    }
  });
});

describe('error log and crash marker', () => {
  it('keeps the last 20; no personal data; page name only', () => {
    const s = memStore();
    for (let i = 0; i < 30; i++) logError('error', 'boom ' + i, 'sing', s, i);
    const l = readLog(s);
    expect(l).toHaveLength(MAX_LOG);
    expect(l[19].msg).toBe('boom 29');
    expect(cleanMessage('failed for maria@example.com token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9')).toBe('failed for [email] token […]');
    expect(cleanMessage('x'.repeat(500)).length).toBeLessThanOrEqual(200);
    expect(pageName('#/songs/s123/learn')).toBe('songs');
    expect(pageName('')).toBe('home');
    expect(pageName('#access_token=secret')).toBe('auth');
    expect(formatReport(l.slice(0, 1), 'v1')).toContain('error [sing] boom 10');
    expect(formatReport([], 'v1')).toContain('no errors');
  });
  it('a marker left behind means the last run was killed on screen; leaving normally leaves none', () => {
    const s = memStore();
    expect(checkLastRun(s)).toBeNull();
    markAlive('sing', ['mic'], s, 1000);
    clearAlive(s); // hidden or closed normally
    expect(checkLastRun(s)).toBeNull();
    markAlive('sing', ['mic'], s, 1000);
    expect(checkLastRun(s)).toEqual({ page: 'sing', route: 'sing' });
    expect(readLog(s)[0]).toMatchObject({ kind: 'killed', page: 'sing' });
    expect(readLog(s)[0].msg).toContain('mic');
    expect(checkLastRun(s)).toBeNull(); // reported once
  });
  it('a broken log or full storage never throws', () => {
    const full = { getItem: () => 'not json', setItem: () => { throw new Error('quota'); }, removeItem: () => { throw new Error('x'); } };
    expect(readLog(full)).toEqual([]);
    expect(() => logError('error', 'x', 'p', full)).not.toThrow();
    expect(() => markAlive('p', [], full)).not.toThrow();
    expect(checkLastRun(full)).toBeNull();
  });
});

describe('storage', () => {
  afterEach(() => vi.unstubAllGlobals());
  const stubStorage = (quotaFull = false) => {
    const m = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => {
        if (quotaFull && !k.startsWith('sotylog')) throw new DOMException('full', 'QuotaExceededError');
        m.set(k, v);
      },
      removeItem: (k: string) => void m.delete(k),
    });
    return m;
  };
  it('when the 5 MB quota is full, saving never throws, and it is logged', () => {
    const m = stubStorage(true);
    expect(() => addResult('match', 80)).not.toThrow();
    expect(JSON.parse(m.get('sotylog.errors')!)[0].kind).toBe('storage');
  });
  it('a round in progress survives a kill: the next start saves it, once', () => {
    stubStorage();
    savePendingResult('loop', 70, 'song: 60% ← 70%', { songId: 's1' });
    expect(getResults()).toHaveLength(0);
    flushPendingResult();
    expect(getResults()).toHaveLength(1);
    expect(getResults()[0]).toMatchObject({ type: 'loop', value: 70, songId: 's1' });
    flushPendingResult();
    expect(getResults()).toHaveLength(1);
    savePendingResult('loop', 70, 'x');
    savePendingResult(null);
    flushPendingResult();
    expect(getResults()).toHaveLength(1); // finished normally: nothing pending
  });
});
