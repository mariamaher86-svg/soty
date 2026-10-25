import { describe, expect, it } from 'vitest';
import { earIsReal, humIsReal, intervalsIsReal, matchIsReal, maqamIsReal, MIN_MATCH_TRIES, rangeIsReal, secondsIsReal, sirenIsReal, stabilityIsReal, trillIsReal, warmupIsReal, workoutCounts } from './stepRules';
import { countedWorkouts, isEmptyMeasurement, measureValue, streak, usableMeasurements, type Measurement } from './path';

const empty: Measurement = { date: '2026-10-20', rangeLow: null, rangeHigh: null, matchCents: null, matchLockSec: null, sustainSec: null, stabilityCents: null, hissSec: null };

describe('a step needs a real result before "next"', () => {
  it('range: two notes, at least 3 semitones apart', () => {
    expect(rangeIsReal(null, null)).toBe(false);
    expect(rangeIsReal(57, 58)).toBe(false);
    expect(rangeIsReal(55, 70)).toBe(true);
  });
  it('pitch matching: enough attempts AND she actually sang', () => {
    expect(matchIsReal(5, null, MIN_MATCH_TRIES.measure)).toBe(false); // 5 skips without singing
    expect(matchIsReal(4, 30, MIN_MATCH_TRIES.measure)).toBe(false);
    expect(matchIsReal(5, 30, MIN_MATCH_TRIES.measure)).toBe(true);
    expect(matchIsReal(3, 30, MIN_MATCH_TRIES.workout)).toBe(true);
  });
  it('sustain / ssss / stability / maqam / ear / intervals', () => {
    expect(secondsIsReal(null)).toBe(false);
    expect(secondsIsReal(0.4)).toBe(false);
    expect(secondsIsReal(1.2)).toBe(true);
    expect(stabilityIsReal(null)).toBe(false);
    expect(stabilityIsReal(Infinity)).toBe(false);
    expect(stabilityIsReal(14.2)).toBe(true);
    expect(maqamIsReal(0)).toBe(false); // every degree skipped
    expect(maqamIsReal(25)).toBe(true);
    expect(earIsReal(2)).toBe(false);
    expect(earIsReal(3)).toBe(true);
    expect(intervalsIsReal(0, 3)).toBe(false); // 3 skips
    expect(intervalsIsReal(1, 1)).toBe(true);
    expect(intervalsIsReal(0, 5)).toBe(true);
  });
  it('warm-up parts and the warm-up as a whole', () => {
    expect(trillIsReal(2)).toBe(false);
    expect(trillIsReal(6)).toBe(true);
    expect(sirenIsReal(0.1, 60)).toBe(false); // silence
    expect(sirenIsReal(0.6, 4)).toBe(false); // stopped right away
    expect(sirenIsReal(0.6, 30)).toBe(true);
    expect(humIsReal([null, null, undefined])).toBe(false);
    expect(humIsReal([12, null, -20])).toBe(true);
    expect(warmupIsReal(1)).toBe(false);
    expect(warmupIsReal(2)).toBe(true);
  });
});

describe('skipped steps and workouts', () => {
  it('a workout counts only with at least half of its steps really done', () => {
    expect(workoutCounts(0, 7)).toBe(false); // every step skipped
    expect(workoutCounts(3, 7)).toBe(false);
    expect(workoutCounts(4, 7)).toBe(true);
    expect(workoutCounts(2, 3)).toBe(true); // light day
    expect(workoutCounts(1, 3)).toBe(false);
    expect(workoutCounts(0, 0)).toBe(false);
  });
  it('a skipped step saves nothing: an all-skipped measurement is empty', () => {
    expect(isEmptyMeasurement(empty)).toBe(true);
    expect(isEmptyMeasurement({ ...empty, sustainSec: 9 })).toBe(false);
    expect(measureValue({ ...empty, sustainSec: 9 }, 'range')).toBeNull(); // shown as "مش متقاس", not 0
  });
});

describe('old junk data is ignored, not deleted', () => {
  it('a baseline/weekly point full of zeros is treated as missing', () => {
    const junk = { ...empty, rangeLow: 0, rangeHigh: 0, matchCents: 0 } as Measurement;
    expect(isEmptyMeasurement(junk)).toBe(true);
    const real = { ...empty, date: '2026-10-21', rangeLow: 55, rangeHigh: 70 };
    const p = { baseline: junk, weekly: [junk, real], workouts: [] };
    const u = usableMeasurements(p);
    expect(u.baseline).toBeUndefined();
    expect(u.weekly).toEqual([real]);
    expect(p.baseline).toBe(junk); // the stored data itself is untouched
    expect(measureValue({ ...empty, matchLockSec: 0, matchCents: 12 }, 'matchLockSec')).toBe(0); // locked at once is real
  });
  it('the streak skips old "next-next" days that have no real results', () => {
    const workouts = [
      { date: '2026-10-18', maqam: 'ajam', feeling: null }, // old log, no results that day → junk
      { date: '2026-10-19', maqam: 'ajam', feeling: null }, // old log with results → real
      { date: '2026-10-20', maqam: 'ajam', feeling: null, done: 4 }, // new log
    ];
    const counted = countedWorkouts(workouts, new Set(['2026-10-19']));
    expect(counted.map((w) => w.date)).toEqual(['2026-10-19', '2026-10-20']);
    expect(streak(counted.map((w) => w.date), '2026-10-20')).toBe(2);
    expect(countedWorkouts([{ date: '2026-10-20', maqam: 'ajam', feeling: null, done: 0 }], new Set(['2026-10-20']))).toEqual([]);
  });
});
