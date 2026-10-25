import { describe, expect, it } from 'vitest';
import { beatSeconds, calibrateLatency, detectOnsets, onsetThreshold, patternTimes, RHYTHM_PATTERNS, scheduleBeats, timingScore, timingWords } from './rhythm';

describe('metronome scheduling', () => {
  it('schedules every beat inside the lookahead, accenting beat 1', () => {
    expect(beatSeconds(120)).toBe(0.5);
    const r = scheduleBeats(1, 0, 1, 1.2, 120, 4); // beats at 1, 1.5, 2
    expect(r.beats.map((b) => b.time)).toEqual([1, 1.5, 2]);
    expect(r.beats.map((b) => b.accent)).toEqual([true, false, false]);
    const next = scheduleBeats(r.nextTime, r.nextIndex, 2.1, 1, 120, 4); // continues without gaps or repeats
    expect(next.beats.map((b) => [b.time, b.index, b.accent])).toEqual([
      [2.5, 3, false],
      [3, 4, true],
    ]);
    expect(scheduleBeats(5, 9, 1, 0.1, 120, 4).beats).toEqual([]);
  });
  it('pattern times over two bars, rests left out', () => {
    const rest = RHYTHM_PATTERNS.find((p) => p.id === 'rest')!;
    expect(patternTimes(rest.beats, 0, 60, 2)).toEqual([0, 1, 3, 4, 5, 7]);
    const eighths = RHYTHM_PATTERNS.find((p) => p.id === 'eighths')!;
    expect(patternTimes(eighths.beats, 0, 120, 1)[1]).toBeCloseTo(0.25);
  });
});

describe('onset detection', () => {
  const frames = (claps: number[], until = 4) => {
    const out: { t: number; rms: number }[] = [];
    for (let t = 0; t < until; t += 0.016) out.push({ t, rms: claps.some((c) => t >= c && t < c + 0.06) ? 0.3 : 0.004 });
    return out;
  };
  it('finds each clap once, ignores the room', () => {
    const f = frames([0.5, 1.0, 1.5, 2.0]);
    const th = onsetThreshold(f.map((x) => x.rms));
    expect(th).toBeGreaterThanOrEqual(0.03);
    const on = detectOnsets(f, th);
    expect(on).toHaveLength(4);
    on.forEach((t, i) => expect(Math.abs(t - [0.5, 1, 1.5, 2][i])).toBeLessThan(0.02));
  });
  it('a long loud sound is one onset, not many', () => {
    const f: { t: number; rms: number }[] = [];
    for (let t = 0; t < 2; t += 0.016) f.push({ t, rms: t > 0.5 && t < 1.5 ? 0.3 : 0.004 });
    expect(detectOnsets(f, 0.05)).toHaveLength(1);
  });
});

describe('latency calibration and timing', () => {
  const clicks = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5];
  it('measures the phone delay from clapping with the clicks', () => {
    const claps = clicks.map((c, i) => c + 0.12 + (i % 2 ? 0.01 : -0.01));
    expect(calibrateLatency(claps, clicks)!.offset).toBeCloseTo(0.12, 2);
    expect(calibrateLatency([1.1, 3.1], clicks)).toBeNull(); // too few claps
  });
  it('after subtracting the delay, on-time claps score 100', () => {
    const claps = clicks.map((c) => c + 0.12);
    expect(timingScore(claps, clicks, 0.12).score).toBe(100);
    expect(timingScore(claps, clicks, 0).score).toBeLessThan(80); // without calibration it looks late
  });
  it('early/late in plain words; missed and extra claps lower the score', () => {
    const t = timingScore([1.0, 1.3, 2.1], [1, 1.5, 2, 2.5]);
    expect(t.errors[0]).toBeCloseTo(0);
    expect(t.errors[1]).toBeCloseTo(-0.2);
    expect(t.errors[2]).toBeCloseTo(0.1);
    expect(t.errors[3]).toBeNull();
    expect(timingWords(-0.2)).toBe('دخلتي بدري ٠٫٢ ثانية');
    expect(timingWords(0.1)).toBe('دخلتي متأخر ٠٫١ ثانية');
    expect(timingWords(0.02)).toBe('مظبوط ✔');
    const extra = timingScore([1, 1.25, 1.5], [1, 1.5]);
    expect(extra.score).toBeLessThan(100);
    expect(timingScore([], [1, 2]).score).toBe(0);
  });
});
