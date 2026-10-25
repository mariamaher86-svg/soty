import { describe, expect, it } from 'vitest';
import { courseLength, courseScore, gatePoints, inGate, makeCourse, midiToY, stepBird } from './game';

describe('pitch → height', () => {
  it('her low note near the bottom, her high note near the top, clamped outside', () => {
    expect(midiToY(55, 55, 79, 400)).toBeCloseTo(352);
    expect(midiToY(79, 55, 79, 400)).toBeCloseTo(48);
    expect(midiToY(67, 55, 79, 400)).toBeCloseTo(200);
    expect(midiToY(40, 55, 79, 400)).toBeCloseTo(352);
    expect(midiToY(100, 55, 79, 400)).toBeCloseTo(48);
  });
  it('the bird eases toward her note, and glides down gently when she is silent (never below the ground)', () => {
    const y = stepBird(300, 100, 1 / 60, 400);
    expect(y).toBeLessThan(300);
    expect(y).toBeGreaterThan(100);
    let g = 100;
    for (let i = 0; i < 60; i++) g = stepBird(g, null, 1 / 60, 400);
    expect(g).toBeCloseTo(160); // 60 px per second
    for (let i = 0; i < 600; i++) g = stepBird(g, null, 1 / 60, 400);
    expect(g).toBe(380);
  });
});

describe('gates and scoring', () => {
  it('inside = within the tolerance in cents (an octave off is outside)', () => {
    expect(inGate(64.3, 64, 35)).toBe(true);
    expect(inGate(64.4, 64, 35)).toBe(false);
    expect(inGate(52, 64, 35)).toBe(false);
    expect(inGate(null, 64, 35)).toBe(false);
  });
  it('points by time inside; percent over the course', () => {
    expect(gatePoints(1, 2)).toBe(50);
    expect(gatePoints(3, 2)).toBe(100);
    expect(courseScore([100, 50, 0])).toEqual({ points: 150, percent: 50 });
    expect(courseScore([])).toEqual({ points: 0, percent: 0 });
  });
  it('courses stay in her range; level 2 is do-re-mi, level 3 has quarter tones', () => {
    for (const lvl of [1, 2, 3] as const) {
      const c = makeCourse(lvl, 57, 74, 60, 7);
      expect(c.length).toBeGreaterThan(5);
      for (const g of c) {
        expect(g.midi).toBeGreaterThanOrEqual(57);
        expect(g.midi).toBeLessThanOrEqual(74);
      }
      for (let i = 1; i < c.length; i++) expect(c[i].t).toBeGreaterThanOrEqual(c[i - 1].t + c[i - 1].dur); // no overlaps
      expect(courseLength(c)).toBeGreaterThan(c[c.length - 1].t);
    }
    expect(makeCourse(2, 57, 74, 60).slice(0, 5).map((g) => g.midi)).toEqual([60, 62, 64, 65, 67]);
    expect(makeCourse(3, 57, 74, 60).some((g) => g.midi % 1 === 0.5)).toBe(true);
    expect(makeCourse(1, 57, 74, 60, 3)).toEqual(makeCourse(1, 57, 74, 60, 3)); // same seed, same course
  });
});
