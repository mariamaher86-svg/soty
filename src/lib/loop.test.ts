import { describe, expect, it } from 'vitest';
import { loopWindow, markAt, mediaLatency, nudge, realDuration, scoreRepeat, toRealTime, trend } from './loop';
import { currentIntervalLevel, INTERVAL_LEVELS, intervalDeviation, intervalTarget, isLevelOpen, makeIntervalTask } from './intervalSing';
import { centsBetween, freqToMidi, midiToFreq, shiftCents } from './music';
import { seededRng } from './ear';
import type { PitchPoint } from './compare';

describe('loop window', () => {
  it('pads 1 s each side', () => {
    expect(loopWindow(83, 85, 200)).toEqual({ start: 82, end: 86 });
  });
  it('clamps to the start and end of the track', () => {
    expect(loopWindow(0.4, 2, 200)).toEqual({ start: 0, end: 3 });
    expect(loopWindow(198, 199.8, 200)).toEqual({ start: 197, end: 200 });
    expect(loopWindow(5, 5, 5.2, 0)).toEqual({ start: 4.7, end: 5.2 }); // minimum length, still inside
  });
  it('−/+ buttons keep it valid', () => {
    const w = { start: 10, end: 12 };
    expect(nudge(w, 'start', -0.5, 100)).toEqual({ start: 9.5, end: 12 });
    expect(nudge(w, 'start', +5, 100).start).toBeCloseTo(11.5); // never past end − 0.5
    expect(nudge(w, 'end', +200, 100).end).toBe(100);
    expect(nudge({ start: 0.2, end: 3 }, 'start', -1, 100).start).toBe(0);
  });
  it('"start here / end here" while playing', () => {
    expect(markAt({ start: 0, end: 5 }, 'start', 3, 100)).toEqual({ start: 3, end: 5 });
    expect(markAt({ start: 0, end: 5 }, 'start', 8, 100)).toEqual({ start: 8, end: 8.5 });
    expect(markAt({ start: 3, end: 5 }, 'end', 9, 100)).toEqual({ start: 3, end: 9 });
    expect(markAt({ start: 3, end: 5 }, 'end', 1, 100)).toEqual({ start: 0.5, end: 3.5 });
  });
});

describe('slower speeds', () => {
  it('converts mic delay to media time and repeat length to real time', () => {
    expect(mediaLatency(0.1, 1)).toBeCloseTo(0.1);
    expect(mediaLatency(0.1, 0.75)).toBeCloseTo(0.075);
    expect(realDuration({ start: 10, end: 13 }, 0.75)).toBeCloseTo(4);
  });
  it('stretches the reference phrase in real time', () => {
    const ref: PitchPoint[] = [5, 10, 11, 13, 20].map((t) => ({ t, freq: 220 }));
    expect(toRealTime(ref, { start: 10, end: 13 }, 0.75).map((p) => +p.t.toFixed(3))).toEqual([0, 1.333, 4]);
    expect(toRealTime(ref, { start: 10, end: 13 }, 1).map((p) => p.t)).toEqual([0, 1, 3]);
  });
});

describe('per-repeat score', () => {
  const ref: PitchPoint[] = Array.from({ length: 300 }, (_, i) => ({ t: i * 0.02, freq: i < 150 ? 220 : 330 }));
  const w = { start: 2, end: 4 };
  it('only the loop window counts (octave-insensitive)', () => {
    const good = ref.filter((p) => p.t >= 2 && p.t <= 4).map((p) => ({ t: p.t, freq: p.freq! * 2 }));
    expect(scoreRepeat(good, ref, w)).toBe(100);
    const half = good.map((p, i) => ({ t: p.t, freq: i % 2 ? shiftCents(p.freq, 150) : p.freq }));
    expect(scoreRepeat(half, ref, w)).toBeGreaterThan(40);
    expect(scoreRepeat(half, ref, w)).toBeLessThan(60);
    expect(scoreRepeat([], ref, w)).toBe(0);
  });
  it('shows the trend', () => {
    expect(trend([52, 68, 81])).toEqual({ text: '52% ← 68% ← 81%', better: true });
    expect(trend([80, 60]).better).toBe(false);
    expect(trend([70]).better).toBeNull();
  });
});

describe('interval singing', () => {
  it('targets up and down, exact cents', () => {
    const a3 = midiToFreq(57);
    expect(centsBetween(intervalTarget(a3, 700, false), a3)).toBeCloseTo(700);
    expect(freqToMidi(intervalTarget(a3, 700, false))).toBeCloseTo(64);
    expect(freqToMidi(intervalTarget(a3, 300, true))).toBeCloseTo(54);
    expect(centsBetween(intervalTarget(a3, 150, false), a3)).toBeCloseTo(150); // three-quarter tone
    expect(centsBetween(intervalTarget(a3, 350, false), a3)).toBeCloseTo(350);
  });
  it('octave-insensitive only for unison and octave', () => {
    const t = midiToFreq(60);
    expect(intervalDeviation(t * 2, t, 0)).toBeCloseTo(0);
    expect(intervalDeviation(t / 2, t, 1200)).toBeCloseTo(0);
    expect(intervalDeviation(t * 2, t, 700)).toBeCloseTo(1200);
    expect(intervalDeviation(shiftCents(t, 20), t, 700)).toBeCloseTo(20);
  });
  it('tasks stay inside her range, both notes', () => {
    const rng = seededRng(7);
    for (let lv = 0; lv < INTERVAL_LEVELS.length; lv++) {
      for (let k = 0; k < 40; k++) {
        const task = makeIntervalTask(lv, 55, 70, rng);
        expect(INTERVAL_LEVELS[lv].cents).toContain(task.cents);
        for (const f of [task.refFreq, task.target]) {
          expect(freqToMidi(f)).toBeGreaterThanOrEqual(54.99);
          expect(freqToMidi(f)).toBeLessThanOrEqual(70.01);
        }
        if (!INTERVAL_LEVELS[lv].down) expect(task.down).toBe(false);
      }
    }
    const small = makeIntervalTask(0, 60, 66, seededRng(1));
    expect(small.cents).not.toBe(1200); // an octave doesn't fit a small range
    expect(Array.from({ length: 30 }, () => makeIntervalTask(3, 50, 74, rng).down)).toContain(true);
  });
  it('unlock rule: 8 of the last 10 opens the next level', () => {
    const T = Array(10).fill(true);
    expect(isLevelOpen(0, [])).toBe(true);
    expect(isLevelOpen(1, [])).toBe(false);
    expect(isLevelOpen(1, [[...Array(8).fill(true), false, false]])).toBe(true);
    expect(isLevelOpen(2, [T])).toBe(false);
    expect(isLevelOpen(4, [T, T, T, T])).toBe(true);
    expect(currentIntervalLevel([T, T])).toBe(2);
    expect(currentIntervalLevel([T, T, T, T, T])).toBe(4);
  });
});
