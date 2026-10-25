import { describe, expect, it } from 'vitest';
import { guidance, HoldTracker, median, percent, SoundTimer, stabilityCents, stabilityRating, stdDev, SteadyNoteDetector } from './stats';
import { midiToFreq, shiftCents } from './music';

describe('basic stats', () => {
  it('median and stdDev', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(stdDev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2);
    expect(percent(3, 4)).toBe(75);
    expect(percent(1, 0)).toBe(0);
  });
});

describe('stability', () => {
  it('a perfectly steady note has 0 cents spread', () => {
    expect(stabilityCents([440, 440, 440])).toBe(0);
  });
  it('measures spread in cents', () => {
    const freqs = [-20, 20, -20, 20].map((c) => shiftCents(440, c));
    expect(stabilityCents(freqs)).toBeCloseTo(20, 0);
  });
  it('rates smaller spread higher', () => {
    expect(stabilityRating(5).stars).toBe(4);
    expect(stabilityRating(15).stars).toBe(3);
    expect(stabilityRating(30).stars).toBe(2);
    expect(stabilityRating(50).stars).toBe(1);
  });
});

describe('guidance', () => {
  it('tells which way to go', () => {
    expect(guidance(15).ok).toBe(true);
    expect(guidance(35).ar).toContain('انزلي');
    expect(guidance(-35).ar).toContain('اطلعي');
    expect(guidance(35).ar).toContain('+35');
  });
});

describe('HoldTracker', () => {
  it('succeeds after holding within tolerance for 1s', () => {
    const h = new HoldTracker(20, 1000);
    for (let i = 0; i < 9; i++) h.update(10, 100);
    expect(h.done).toBe(false);
    h.update(-10, 100);
    expect(h.done).toBe(true);
  });
  it('forgives a short glitch but resets on a long miss', () => {
    const h = new HoldTracker(20, 1000, 150);
    h.update(0, 500);
    h.update(null, 100);
    expect(h.progress).toBeCloseTo(0.5);
    h.update(50, 100);
    expect(h.progress).toBe(0);
  });
});

describe('SteadyNoteDetector', () => {
  it('reports a note held steadily for the window', () => {
    const d = new SteadyNoteDetector(700, 0.6);
    let out: number | null = null;
    for (let t = 0; t <= 800; t += 20) out = d.update(t, midiToFreq(57));
    expect(out).toBeCloseTo(57);
  });
  it('ignores a sliding pitch', () => {
    const d = new SteadyNoteDetector(700, 0.6);
    let out: number | null = null;
    for (let t = 0; t <= 800; t += 20) out = d.update(t, midiToFreq(57 + t / 200));
    expect(out).toBeNull();
  });
});

describe('SoundTimer', () => {
  it('times from first sound to last sound', () => {
    const s = new SoundTimer(300);
    s.update(0, false);
    s.update(100, true);
    s.update(2100, true);
    s.update(2200, false);
    expect(s.finished).toBe(false);
    s.update(2500, false);
    expect(s.finished).toBe(true);
    expect(s.duration).toBe(2000);
  });
});
