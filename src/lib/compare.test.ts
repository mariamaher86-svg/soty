import { describe, expect, it } from 'vitest';
import { compareCurves, foldToOctaveOf, octaveInsensitiveCents, sampleAt, type PitchPoint } from './compare';
import { shiftCents } from './music';
import { extractPitchCurve } from './pitchTrack';
import { dailyBest } from './progress';
import type { Result } from './storage';

const curve = (n: number, f: (i: number) => number | null, dt = 0.02): PitchPoint[] => Array.from({ length: n }, (_, i) => ({ t: i * dt, freq: f(i) }));

describe('octave-insensitive comparison', () => {
  it('an octave apart counts as the same note', () => {
    expect(octaveInsensitiveCents(440, 220)).toBeCloseTo(0);
    expect(octaveInsensitiveCents(shiftCents(880, 30), 440)).toBeCloseTo(30);
    expect(octaveInsensitiveCents(shiftCents(220, -30), 440)).toBeCloseTo(-30);
  });

  it('folds a frequency to the reference octave', () => {
    expect(foldToOctaveOf(880, 440)).toBeCloseTo(440);
    expect(foldToOctaveOf(110, 440)).toBeCloseTo(440);
  });

  it('samples the nearest point in time', () => {
    const c = curve(10, (i) => 100 + i);
    expect(sampleAt(c, 0.041)?.freq).toBe(102);
    expect(sampleAt(c, 5)).toBeNull();
  });

  it('scores 100 when singing the melody an octave higher', () => {
    const ref = curve(100, (i) => 220 * Math.pow(2, Math.floor(i / 25) / 12));
    const sung = ref.map((p) => ({ t: p.t, freq: p.freq! * 2 }));
    const r = compareCurves(sung, ref);
    expect(r.score).toBe(100);
    expect(r.offRanges).toHaveLength(0);
  });

  it('finds the time range where she was off', () => {
    const ref = curve(100, () => 330); // 2 seconds
    const sung = ref.map((p, i) => ({ t: p.t, freq: i >= 50 && i < 75 ? shiftCents(330, 120) : 330 }));
    const r = compareCurves(sung, ref);
    expect(r.score).toBe(75);
    expect(r.offRanges).toHaveLength(1);
    expect(r.offRanges[0].start).toBeCloseTo(1.0);
    expect(r.offRanges[0].end).toBeCloseTo(1.48);
    expect(r.offRanges[0].avgCents).toBe(120);
  });

  it('ignores reference silences and counts her silence as off', () => {
    const ref = curve(50, (i) => (i < 25 ? null : 440));
    const sung = curve(50, () => null);
    const r = compareCurves(sung, ref);
    expect(r.score).toBe(0);
    expect(r.offRanges[0].avgCents).toBeNull();
  });
});

describe('pitch extraction', () => {
  it('finds the pitch of a synthetic sine', async () => {
    const sr = 16000;
    const samples = new Float32Array(sr); // 1 second at 220 Hz
    for (let i = 0; i < samples.length; i++) samples[i] = 0.5 * Math.sin((2 * Math.PI * 220 * i) / sr);
    const c = await extractPitchCurve(samples, sr, { windowSize: 1024 });
    const voiced = c.filter((p) => p.freq);
    expect(voiced.length).toBeGreaterThan(c.length * 0.9);
    for (const p of voiced) expect(Math.abs(octaveInsensitiveCents(p.freq!, 220))).toBeLessThan(5);
  });
});

describe('progress', () => {
  it('keeps the best value per day', () => {
    const rs: Result[] = [
      { type: 'sustain', date: '2026-10-19', value: 8, ts: 1 },
      { type: 'sustain', date: '2026-10-20', value: 10, ts: 2 },
      { type: 'sustain', date: '2026-10-20', value: 12, ts: 3 },
      { type: 'stability', date: '2026-10-20', value: 25, ts: 4 },
      { type: 'stability', date: '2026-10-20', value: 15, ts: 5 },
    ];
    expect(dailyBest(rs, 'sustain')).toEqual([
      { date: '2026-10-19', best: 8, count: 1 },
      { date: '2026-10-20', best: 12, count: 2 },
    ]);
    expect(dailyBest(rs, 'stability')[0].best).toBe(15); // lower is better
  });
});
