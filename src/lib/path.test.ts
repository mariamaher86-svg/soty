import { describe, expect, it } from 'vitest';
import { compareMeasure, compareMeasurements, daysBetween, middleRange, middleTonic, shouldGoLight, streak, todaysMaqam, weeklyStatus, workoutPlan, FIRST_WEEK, type Measurement } from './path';

describe("today's maqam", () => {
  it('starts with easy maqamat and rotates daily', () => {
    expect([0, 1, 2, 3].map(todaysMaqam)).toEqual(['ajam', 'nahawand', 'ajam', 'nahawand']);
  });
  it('unlocks Rast, then Bayati, then Hijaz', () => {
    expect([6, 7, 8].map(todaysMaqam)).toEqual(['ajam', 'nahawand', 'rast']);
    expect(Array.from({ length: 4 }, (_, i) => todaysMaqam(12 + i))).toContain('bayati');
    expect(Array.from({ length: 5 }, (_, i) => todaysMaqam(20 + i))).toContain('hijaz');
    expect(Array.from({ length: 12 }, (_, i) => todaysMaqam(i))).not.toContain('hijaz');
  });
});

describe('weekly check', () => {
  it('asks for a baseline first', () => {
    expect(weeklyStatus(null, '2026-10-20')).toEqual({ kind: 'baseline' });
  });
  it('is due after 7 days, across months', () => {
    expect(weeklyStatus('2026-10-13', '2026-10-20')).toEqual({ kind: 'due' });
    expect(weeklyStatus('2026-10-28', '2026-11-04')).toEqual({ kind: 'due' });
    expect(weeklyStatus('2026-10-15', '2026-10-20')).toEqual({ kind: 'later', inDays: 2 });
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2); // DST change doesn't matter
  });
});

describe('streak', () => {
  it('counts days in a row up to today', () => {
    expect(streak(['2026-10-18', '2026-10-19', '2026-10-20'], '2026-10-20')).toBe(3);
  });
  it('still counts when today is not done yet', () => {
    expect(streak(['2026-10-18', '2026-10-19'], '2026-10-20')).toBe(2);
  });
  it('breaks on a missed day', () => {
    expect(streak(['2026-10-15', '2026-10-16', '2026-10-18', '2026-10-19', '2026-10-20'], '2026-10-20')).toBe(3);
    expect(streak(['2026-10-17', '2026-10-18'], '2026-10-20')).toBe(0);
    expect(streak([], '2026-10-20')).toBe(0);
  });
  it('works across a month boundary and duplicate days', () => {
    expect(streak(['2026-09-30', '2026-10-01', '2026-10-01'], '2026-10-01')).toBe(2);
  });
});

describe('middle of the range', () => {
  it('uses the middle half of a wide range', () => {
    expect(middleRange(48, 72)).toEqual({ low: 54, high: 66 });
  });
  it('keeps at least ±3 semitones but stays inside the range', () => {
    expect(middleRange(55, 63)).toEqual({ low: 56, high: 62 });
    expect(middleRange(57, 60)).toEqual({ low: 57, high: 60 });
  });
  it('maqam tonic centers the octave', () => {
    expect(middleTonic(48, 72)).toBe(54); // octave 54–66 in the middle
    expect(middleTonic(55, 64)).toBe(55); // range smaller than an octave
  });
});

describe('workout plan', () => {
  it('normal day ≈ 13 minutes: warm-up first, a maqam, ears then intervals last; light day shorter without maqam/intervals', () => {
    const sum = (p: { minutes: number }[]) => p.reduce((a, s) => a + s.minutes, 0);
    expect(sum(workoutPlan(false, 8))).toBe(13);
    expect(workoutPlan(false, 8).map((s) => s.step)).toEqual(['warmup', 'hiss', 'match', 'sustain', 'maqam', 'ear', 'intervals']);
    expect(workoutPlan(true).some((s) => s.step === 'intervals')).toBe(false);
    expect(workoutPlan(true)[0].step).toBe('warmup');
    expect(workoutPlan(false, 8).map((s) => s.step)).toEqual(['warmup', 'hiss', 'match', 'sustain', 'maqam', 'ear', 'intervals']);
    expect(workoutPlan(false, 9).map((s) => s.step)).toEqual(['warmup', 'hiss', 'match', 'sustain', 'maqam', 'ear', 'rhythm']); // every other day
    expect(sum(workoutPlan(true))).toBeLessThan(7);
    expect(workoutPlan(true).some((s) => s.step === 'maqam')).toBe(false);
  });
  it('goes light the day after feeling a bit tired', () => {
    expect(shouldGoLight([{ date: '2026-10-19', maqam: 'ajam', feeling: 'little' }], '2026-10-20')).toBe(true);
    expect(shouldGoLight([{ date: '2026-10-19', maqam: 'ajam', feeling: 'no' }], '2026-10-20')).toBe(false);
    expect(shouldGoLight([{ date: '2026-10-15', maqam: 'ajam', feeling: 'little' }], '2026-10-20')).toBe(false);
  });
});

describe('comparison messages', () => {
  it('improved (higher is better)', () => {
    expect(compareMeasure('sustainSec', 8, 14)).toEqual({ trend: 'better', ar: 'النفس زاد من 8 لـ 14 ثانية 👏' });
  });
  it('improved (lower is better)', () => {
    expect(compareMeasure('matchCents', 45, 25)).toEqual({ trend: 'better', ar: 'النشاز قل من ±45 لـ ±25 سنت 👏' });
  });
  it('about the same', () => {
    expect(compareMeasure('sustainSec', 10, 10.4)?.trend).toBe('same');
  });
  it('lower, said gently', () => {
    const r = compareMeasure('hissSec', 20, 15)!;
    expect(r.trend).toBe('worse');
    expect(r.ar).toContain('عادي');
  });
  it('skips missing values and compares whole measurements', () => {
    expect(compareMeasure('sustainSec', null, 5)).toBeNull();
    const a: Measurement = { date: '2026-10-01', rangeLow: 55, rangeHigh: 70, matchCents: 45, matchLockSec: 3, sustainSec: 8, stabilityCents: 30, hissSec: null };
    const b: Measurement = { ...a, date: '2026-10-08', rangeHigh: 72, matchCents: 25, sustainSec: 14 };
    const r = compareMeasurements(a, b);
    expect(r).toHaveLength(5);
    expect(r[0].ar).toBe('المساحة الصوتية زادت من 15 لـ 17 نصف تون 👏');
  });
});

describe('first week of voice practice (no lessons needed)', () => {
  it('the note ladder replaces pitch matching and intervals wait, for the first 7 counted workouts', () => {
    for (let done = 0; done < FIRST_WEEK; done++) {
      const p = workoutPlan(false, done).map((s) => s.step);
      expect(p, String(done)).toContain('findnote');
      expect(p).not.toContain('match');
      expect(p).not.toContain('intervals');
      expect(p).not.toContain('rhythm');
      expect(p[0]).toBe('warmup');
    }
    expect(workoutPlan(true, 0).map((s) => s.step)).toEqual(['warmup', 'findnote', 'ear']);
  });
  it('from the 8th workout intervals open (alternating with rhythm), whatever the lessons', () => {
    expect(workoutPlan(false, FIRST_WEEK).map((s) => s.step)).toContain('match');
    expect(workoutPlan(false, FIRST_WEEK).map((s) => s.step).at(-1)).toBe('rhythm'); // 7 is odd: a rhythm day
    expect(workoutPlan(false, FIRST_WEEK + 1).map((s) => s.step).at(-1)).toBe('intervals');
  });
});
