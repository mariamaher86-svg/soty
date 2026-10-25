import { describe, expect, it } from 'vitest';
import { currentLevel, difficulty, everPassed, INTERVAL_STAGES, isUnlocked, levelPassed, makeQuestion, maqamScaleFreqs, PITCH_GAPS, seededRng, type Question } from './ear';
import { centsBetween, freqToMidi, midiToFreq } from './music';
import { humNotes, noiseThreshold, sirenFollow, sirenTarget, sirenWords, soundingSeconds } from './warmup';
import type { PitchPoint } from './compare';

const T = true;
const F = false;
const rep = (x: boolean, n: number) => Array.from({ length: n }, () => x);

describe('level unlock rule', () => {
  it('needs 8 right in the last 10', () => {
    expect(levelPassed([...rep(T, 8), F, F])).toBe(true);
    expect(levelPassed([...rep(T, 7), F, F, F])).toBe(false);
    expect(levelPassed(rep(T, 9))).toBe(false); // fewer than 10 answers
    expect(levelPassed([...rep(F, 5), ...rep(T, 8), F, F])).toBe(true); // only the last 10 count
  });
  it('unlocks the next level and never locks it again', () => {
    expect(isUnlocked('pitch', {})).toBe(true);
    expect(isUnlocked('same', {})).toBe(false);
    expect(isUnlocked('same', { pitch: rep(T, 10) })).toBe(true);
    const later = { pitch: [...rep(T, 10), ...rep(F, 10)] }; // passed once, then a bad day
    expect(levelPassed(later.pitch)).toBe(false);
    expect(everPassed(later.pitch)).toBe(true);
    expect(isUnlocked('same', later)).toBe(true);
    expect(isUnlocked('interval', later)).toBe(false);
    expect(isUnlocked('maqam', { pitch: rep(T, 10), same: rep(T, 10), interval: rep(T, 10) })).toBe(true);
  });
  it('current level = first level not passed yet', () => {
    expect(currentLevel({})).toBe('pitch');
    expect(currentLevel({ pitch: rep(T, 10) })).toBe('same');
    expect(currentLevel({ pitch: rep(T, 10), same: rep(T, 10), interval: rep(T, 10), maqam: rep(T, 10) })).toBe('maqam');
  });
});

describe('question generators', () => {
  const rng = seededRng(42);
  const low = 55;
  const high = 69;
  const inRange = (f: number) => {
    const m = freqToMidi(f);
    return m >= low - 0.6 && m <= high + 0.6;
  };

  it('higher/lower: big gaps first, narrowing to a semitone', () => {
    expect(difficulty([], PITCH_GAPS.length)).toBe(0);
    const easy = makeQuestion('pitch', [], low, high, rng) as Extract<Question, { kind: 'pitch' }>;
    expect(easy.gap).toBe(7);
    const hard = makeQuestion('pitch', rep(T, 10), low, high, rng) as Extract<Question, { kind: 'pitch' }>;
    expect(hard.gap).toBe(1);
    for (let i = 0; i < 50; i++) {
      const q = makeQuestion('pitch', rep(T, i % 11), low, high, rng) as Extract<Question, { kind: 'pitch' }>;
      expect(q.notes.every(inRange)).toBe(true);
      const up = q.notes[1] > q.notes[0];
      expect(q.answer).toBe(up ? 'higher' : 'lower');
      expect(Math.abs(freqToMidi(q.notes[1]) - freqToMidi(q.notes[0]))).toBeCloseTo(q.gap);
    }
  });

  it('same/different: 10–50 cents apart, sometimes identical', () => {
    let same = 0;
    for (let i = 0; i < 100; i++) {
      const q = makeQuestion('same', rep(T, i % 11), low, high, rng) as Extract<Question, { kind: 'same' }>;
      const d = Math.abs(centsBetween(q.notes[1], q.notes[0]));
      if (q.answer === 'same') {
        same++;
        expect(d).toBeCloseTo(0);
      } else {
        expect(d).toBeGreaterThanOrEqual(9.99);
        expect(d).toBeLessThanOrEqual(50.01);
      }
      expect(q.notes.every(inRange)).toBe(true);
    }
    expect(same).toBeGreaterThan(20);
    expect(same).toBeLessThan(60);
    const hardest = makeQuestion('same', rep(T, 10), low, high, seededRng(3));
    if (hardest.kind === 'same' && hardest.answer === 'different') expect(Math.abs(hardest.cents)).toBe(10);
  });

  it('intervals: start with unison/fifth/octave, stay inside her range', () => {
    const first = makeQuestion('interval', [], low, high, rng) as Extract<Question, { kind: 'interval' }>;
    expect(first.choices).toEqual(INTERVAL_STAGES[0]);
    for (let i = 0; i < 60; i++) {
      const q = makeQuestion('interval', rep(T, i % 11), low, high, rng) as Extract<Question, { kind: 'interval' }>;
      expect(q.choices).toContain(q.answer);
      expect(freqToMidi(q.notes[1]) - freqToMidi(q.notes[0])).toBeCloseTo(q.answer);
      expect(q.notes.every(inRange)).toBe(true);
    }
    // a range smaller than an octave never asks for an octave
    const small = makeQuestion('interval', [], 60, 68, rng) as Extract<Question, { kind: 'interval' }>;
    expect(small.choices).not.toContain(12);
  });

  it('maqam: 2 easy choices first, later 3–4 with quarter-tone maqamat', () => {
    const q = makeQuestion('maqam', [], low, high, rng) as Extract<Question, { kind: 'maqam' }>;
    expect(q.choices.sort()).toEqual(['ajam', 'nahawand']);
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const h = makeQuestion('maqam', rep(T, 10), low, high, rng) as Extract<Question, { kind: 'maqam' }>;
      expect(h.choices).toHaveLength(4);
      expect(h.choices).toContain(h.answer);
      expect(new Set(h.choices).size).toBe(4);
      h.choices.forEach((c) => seen.add(c));
      expect(h.tonic + 12).toBeLessThanOrEqual(high);
    }
    expect(seen.has('rast') && seen.has('saba')).toBe(true);
    const rast = maqamScaleFreqs('rast', 60);
    expect(centsBetween(rast[2], midiToFreq(60))).toBeCloseTo(350);
  });
});

describe('siren', () => {
  const mid = { low: 57, high: 65 };
  const wide = { low: 52, high: 72 };

  it('glides smoothly up and down around the middle, widening over time', () => {
    expect(sirenTarget(0, mid, wide)).toBeCloseTo(61);
    const early = Array.from({ length: 200 }, (_, i) => sirenTarget(i * 0.1, mid, wide)); // first 20 s
    expect(Math.max(...early)).toBeLessThan(66);
    expect(Math.min(...early)).toBeGreaterThan(56);
    const late = Array.from({ length: 200 }, (_, i) => sirenTarget(40 + i * 0.1, mid, wide));
    expect(Math.max(...late) - Math.min(...late)).toBeGreaterThan(Math.max(...early) - Math.min(...early));
    expect(Math.max(...late)).toBeLessThanOrEqual(72);
    expect(Math.min(...late)).toBeGreaterThanOrEqual(52);
    for (let t = 0; t < 60; t += 0.05) expect(Math.abs(sirenTarget(t + 0.05, mid, wide) - sirenTarget(t, mid, wide))).toBeLessThan(0.2); // no jumps
  });

  it('scores how closely she followed, ignoring octave and silence', () => {
    const target = (t: number) => sirenTarget(t, mid, wide);
    const perfect: PitchPoint[] = Array.from({ length: 100 }, (_, i) => ({ t: i * 0.1, freq: midiToFreq(target(i * 0.1)) * 2 }));
    expect(sirenFollow(perfect, target).avgCents).toBe(0);
    const off: PitchPoint[] = perfect.map((p, i) => ({ t: p.t, freq: i % 2 ? null : p.freq! * Math.pow(2, 80 / 1200) }));
    const r = sirenFollow(off, target);
    expect(r.avgCents).toBe(80);
    expect(r.voicedShare).toBeCloseTo(0.5);
    expect(sirenFollow([], target).avgCents).toBeNull();
    expect(sirenWords(30)).toContain('ممتازة');
    expect(sirenWords(300)).toContain('مش امتحان');
  });
});

describe('warm-up helpers', () => {
  it('hum notes go up by semitones from the low middle', () => {
    expect(humNotes({ low: 57, high: 65 })).toEqual([57, 58, 59, 60, 61]);
    expect(humNotes({ low: 60, high: 61 })).toHaveLength(3);
  });
  it('lip-trill seconds count only sounding time', () => {
    const frames = Array.from({ length: 100 }, (_, i) => ({ t: i * 0.05, rms: i < 60 ? 0.1 : 0.001 }));
    expect(soundingSeconds(frames, 0.02)).toBeCloseTo(2.95, 1);
    expect(noiseThreshold([0.001, 0.002, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1])).toBe(0.015);
  });
});
