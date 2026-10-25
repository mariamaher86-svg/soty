import { describe, expect, it } from 'vitest';
import { loudHighWarning, scoreDynamics, targetShape, type DynFrame, type DynamicsKind } from './dynamics';

/** Frames over `secs` with loudness from shape(x) in dB (−40…−10) and pitch wobble ±`wobble` cents. */
function take(shape: (x: number) => number, secs = 6, wobble = 0, jitterDb = 0): DynFrame[] {
  const out: DynFrame[] = [];
  for (let t = 0; t < secs; t += 0.02) {
    const x = t / secs;
    const db = -40 + 30 * shape(x) + (jitterDb ? Math.sin(t * 9) * jitterDb : 0);
    out.push({ t, rms: Math.pow(10, db / 20), freq: 440 * Math.pow(2, (wobble * Math.sin(t * 30)) / 1200) });
  }
  return out;
}

describe('dynamics shapes and scores', () => {
  it('target shapes', () => {
    expect(targetShape('cresc', 0.25)).toBe(0.25);
    expect(targetShape('decresc', 0.25)).toBe(0.75);
    expect(targetShape('messa', 0.25)).toBe(0.5);
    expect(targetShape('messa', 0.5)).toBe(1);
    expect(targetShape('messa', 1)).toBe(0);
  });
  it('a smooth crescendo on a steady note scores high on both lines', () => {
    for (const k of ['cresc', 'decresc', 'messa'] as DynamicsKind[]) {
      const s = scoreDynamics(take((x) => targetShape(k, x)), k)!;
      expect(s.loudness).toBeGreaterThanOrEqual(90);
      expect(s.pitch).toBe(100);
      expect(s.rangeDb).toBeGreaterThanOrEqual(25);
    }
  });
  it('the wrong direction, a flat loudness, or a bumpy one scores low on loudness', () => {
    expect(scoreDynamics(take((x) => 1 - x), 'cresc')!.loudness).toBe(0);
    expect(scoreDynamics(take(() => 0.5), 'cresc')!.loudness).toBeLessThan(10);
    const bumpy = scoreDynamics(take((x) => x, 6, 0, 6), 'cresc')!.loudness;
    expect(bumpy).toBeLessThan(scoreDynamics(take((x) => x), 'cresc')!.loudness);
  });
  it('pitch that drifts while getting louder lowers the pitch score, not the loudness score', () => {
    const s = scoreDynamics(take((x) => x, 6, 50), 'cresc')!;
    expect(s.pitch).toBeLessThan(50);
    expect(s.loudness).toBeGreaterThanOrEqual(90);
    expect(s.sdCents).toBeGreaterThan(20);
  });
  it('too little voice = no score', () => {
    expect(scoreDynamics(take((x) => x, 0.2), 'cresc')).toBeNull();
  });
  it('gentle warning only for loud notes near the top of her range', () => {
    expect(loudHighWarning(76, 79)).toBe(true);
    expect(loudHighWarning(70, 79)).toBe(false);
    expect(loudHighWarning(77, 79, -30)).toBe(false);
    expect(loudHighWarning(77, 79, -8)).toBe(true);
  });
});
