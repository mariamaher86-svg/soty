import { describe, expect, it } from 'vitest';
import { addToHistogram, BINS, detectKey, histogramFromFrames, keyLabel, pitchClassCents, type KeyFrame } from './keyDetect';
import { SCALES, spellScale } from './scale';
import { midiToFreq, shiftCents } from './music';

/** Histogram from {cents above tonic: weight} for a tonic given in semitones above C. */
function hist(tonic: number, notes: Record<number, number>): number[] {
  const h = new Array(BINS).fill(0);
  for (const [cents, w] of Object.entries(notes)) addToHistogram(h, shiftCents(midiToFreq(60 + tonic), Number(cents)), w);
  return h;
}

describe('histogram', () => {
  it('folds octaves and splits between bins', () => {
    expect(pitchClassCents(midiToFreq(67))).toBeCloseTo(700);
    expect(pitchClassCents(midiToFreq(43))).toBeCloseTo(700);
    const h = new Array(BINS).fill(0);
    addToHistogram(h, shiftCents(midiToFreq(60), 25), 1); // half-way between bins 0 and 1
    expect(h[0]).toBeCloseTo(0.5);
    expect(h[1]).toBeCloseTo(0.5);
  });

  it('counts steady notes, skips silence and slides', () => {
    const frames: KeyFrame[] = [];
    let t = 0;
    const push = (n: number, f: (i: number) => number | null) => {
      for (let i = 0; i < n; i++) frames.push({ t: (t += 0.02), freq: f(i), clarity: 1 });
    };
    push(50, () => midiToFreq(67)); // 1s G
    push(25, () => null); // silence
    push(25, (i) => midiToFreq(60 + i * 0.4)); // fast slide C -> ~D
    push(50, () => midiToFreq(62)); // 1s D
    const h = histogramFromFrames(frames);
    expect(h[14]).toBeGreaterThan(0.9); // G
    expect(h[4]).toBeGreaterThan(0.9); // D
    const total = h.reduce((a, b) => a + b, 0);
    expect(total).toBeLessThan(2.3);
  });
});

describe('detectKey', () => {
  it('a G-major song detects G major', () => {
    const h = hist(7, { 0: 3, 200: 1.2, 400: 1.5, 500: 1, 700: 2.2, 900: 1.2, 1100: 0.8 });
    const [best] = detectKey(h);
    expect(best.tonic).toBe(7);
    expect(best.scaleIds).toContain('major');
    expect(best.scaleIds).toContain('ajam'); // same notes
  });

  it('Rast with quarter tones beats its 12-TET neighbour Ajam/major', () => {
    const h = hist(0, { 0: 3, 200: 1.2, 350: 1.5, 500: 1.2, 700: 2, 900: 1, 1050: 0.8, 1000: 0.3 });
    const r = detectKey(h);
    expect(r[0].tonic).toBe(0);
    expect(r[0].scaleIds).toContain('rast');
    expect(r.find((c) => c.tonic === 0 && c.scaleIds.includes('major'))?.score ?? 0).toBeLessThan(r[0].score);
  });

  it('Bayati (three-quarter 2nd) beats Kurd (semitone 2nd)', () => {
    const h = hist(2, { 0: 3, 150: 1.5, 300: 1.3, 500: 1.2, 700: 1.8, 800: 0.8, 1000: 0.8 });
    const [best] = detectKey(h);
    expect(best.tonic).toBe(2);
    expect(best.scaleIds).toContain('bayati');
  });

  it('the tonic hint picks between relative major and minor', () => {
    // C major / A minor notes, no tonic emphasis
    const h = hist(0, { 0: 1, 200: 1, 400: 1, 500: 1, 700: 1, 900: 1, 1100: 1 });
    const withA = detectKey(h, midiToFreq(57))[0];
    expect(withA.tonic).toBe(9);
    expect(withA.scaleIds).toContain('minor');
    const withC = detectKey(h, midiToFreq(48))[0];
    expect(withC.tonic).toBe(0);
    expect(withC.scaleIds).toContain('major');
  });

  it('works for a slightly detuned recording (quarter-tone tonic)', () => {
    const h = hist(7.5, { 0: 3, 200: 1.2, 400: 1.5, 500: 1, 700: 2.2, 900: 1.2, 1100: 0.8 });
    expect(detectKey(h)[0].tonic).toBe(7.5);
  });

  it('gives probabilities and confidence', () => {
    const r = detectKey(hist(7, { 0: 3, 200: 1.2, 400: 1.5, 500: 1, 700: 2.2, 900: 1.2, 1100: 0.8 }));
    expect(r).toHaveLength(3);
    expect(r[0].probability).toBeGreaterThan(r[1].probability);
    expect(r.reduce((a, c) => a + c.probability, 0)).toBeLessThanOrEqual(1.0001);
    expect(['high', 'medium', 'low']).toContain(r[0].confidence);
    expect(detectKey(new Array(BINS).fill(0))[0].score).toBe(0);
  });
});

describe('labels', () => {
  it('names candidates in Arabic and English', () => {
    expect(keyLabel({ tonic: 7, scaleIds: ['major', 'ajam'] })).toEqual({ ar: 'صول ماجير / مقام عجم', en: 'G major / Ajam' });
    expect(keyLabel({ tonic: 2, scaleIds: ['bayati'] }).ar).toBe('ري مقام بياتي');
  });
  it('spells a quarter-tone tonic scale', () => {
    const major = SCALES.find((s) => s.id === 'major')!;
    expect(spellScale(7.5, major.pcs)[0].name).toBe('G½♯'); // between G and A♭
    expect(keyLabel({ tonic: 7.5, scaleIds: ['major'] }).en).toBe('G½♯ major');
  });
});
