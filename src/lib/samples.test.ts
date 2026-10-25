import { describe, expect, it } from 'vitest';
import { nearestSample, playbackRate, steadySegment, trimWithFades, trustedFreq, tuneSampleSet } from './samples';
import { centsBetween, midiToFreq, shiftCents } from './music';
import type { PitchPoint } from './compare';

describe('playbackRate (pitch shift)', () => {
  it('an octave up is rate 2, a semitone is 2^(1/12)', () => {
    expect(playbackRate(220, 440)).toBeCloseTo(2);
    expect(playbackRate(midiToFreq(60), midiToFreq(61))).toBeCloseTo(Math.pow(2, 1 / 12));
  });

  it('hits quarter-tone targets exactly', () => {
    const c4 = midiToFreq(60);
    const eHalfFlat = shiftCents(c4, 350); // Rast 3rd
    const sample = midiToFreq(63); // nearest piano sample E♭4
    const played = sample * playbackRate(sample, eHalfFlat);
    expect(centsBetween(played, c4)).toBeCloseTo(350, 6);
    expect(playbackRate(sample, eHalfFlat)).toBeCloseTo(Math.pow(2, 50 / 1200));
  });
});

describe('nearestSample', () => {
  const samples = [48, 51, 54, 57, 60].map((m) => ({ midi: m, freq: midiToFreq(m) }));

  it('picks the closest sample in cents', () => {
    expect(nearestSample(samples, midiToFreq(52))?.midi).toBe(51);
    expect(nearestSample(samples, midiToFreq(53))?.midi).toBe(54);
    expect(nearestSample(samples, midiToFreq(70))?.midi).toBe(60);
    expect(nearestSample(samples, midiToFreq(30))?.midi).toBe(48);
  });

  it('works with measured (uneven) teacher pitches and quarter tones', () => {
    const teacher = [{ freq: 196.5 }, { freq: 262 }, { freq: 330 }];
    expect(nearestSample(teacher, shiftCents(midiToFreq(60), 350))?.freq).toBe(330); // E½♭4 ≈ 320 Hz
    expect(nearestSample(teacher, 200)?.freq).toBe(196.5);
  });

  it('returns undefined when there are no samples', () => {
    expect(nearestSample([], 440)).toBeUndefined();
  });
});

describe('trustedFreq', () => {
  it('uses the measured pitch only when close to the nominal note', () => {
    expect(trustedFreq(440, 443)).toBe(443);
    expect(trustedFreq(440, 880)).toBe(440);
    expect(trustedFreq(440, null)).toBe(440);
  });
});

describe('tuneSampleSet', () => {
  it('keeps good measurements and gives unmeasured samples the typical offset', () => {
    const nominal = [100, 200, 300, 400];
    const measured = [shiftCents(100, -20), null, shiftCents(300, -30), 800]; // 800 = octave error
    const tuned = tuneSampleSet(nominal, measured);
    expect(centsBetween(tuned[0], 100)).toBeCloseTo(-20);
    expect(centsBetween(tuned[1], 200)).toBeCloseTo(-25); // median of -20 and -30
    expect(centsBetween(tuned[2], 300)).toBeCloseTo(-30);
    expect(centsBetween(tuned[3], 400)).toBeCloseTo(-25);
  });
  it('falls back to nominal when nothing could be measured', () => {
    expect(tuneSampleSet([100], [null])).toEqual([100]);
  });
});

describe('steadySegment', () => {
  const at = (n: number, f: (i: number) => number | null): PitchPoint[] => Array.from({ length: n }, (_, i) => ({ t: i * 0.02, freq: f(i) }));

  it('finds the steady part after a scoop and before the release', () => {
    // 0.2s scoop up, 1s steady G3, then a falling release
    const curve = at(80, (i) => (i < 10 ? shiftCents(196, -200 + i * 20) : i < 60 ? shiftCents(196, (i % 2) * 6) : shiftCents(196, -(i - 59) * 30)));
    const seg = steadySegment(curve, 40, 0.4)!;
    expect(seg.start).toBeGreaterThanOrEqual(0.1);
    expect(seg.end).toBeLessThanOrEqual(1.25);
    expect(seg.end - seg.start).toBeGreaterThan(0.9);
    expect(Math.abs(centsBetween(seg.freq, 196))).toBeLessThan(10);
  });

  it('allows a one-frame dropout', () => {
    const curve = at(50, (i) => (i === 20 ? null : 220));
    expect(steadySegment(curve)!.end - steadySegment(curve)!.start).toBeCloseTo(0.98);
  });

  it('returns null when nothing is steady long enough', () => {
    expect(steadySegment(at(50, (i) => 200 + i * 10))).toBeNull();
    expect(steadySegment(at(10, () => null))).toBeNull();
  });
});

describe('trimWithFades', () => {
  it('cuts the range and fades the edges', () => {
    const x = new Float32Array(1000).fill(1);
    const y = trimWithFades(x, 1000, 0.1, 0.6, 0.01);
    expect(y.length).toBe(500);
    expect(y[0]).toBe(0);
    expect(y[250]).toBe(1);
    expect(y[499]).toBeLessThan(0.2);
  });
});
