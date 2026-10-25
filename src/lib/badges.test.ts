import { describe, expect, it } from 'vitest';
import { BADGES, challengeDone, challengeLevel, CHALLENGES, dailyChallenge, earnedBadges, longestRun, newBadges, type BadgeContext } from './badges';
import type { Result, ResultType } from './storage';

const r = (type: ResultType, value: number, date = '2026-10-01'): Result => ({ type, value, date, ts: 0 });
const ctx = (over: Partial<BadgeContext> = {}): BadgeContext => ({ results: [], lessonsDone: {}, lessonCount: 10, phraseProgress: [], challengeDays: [], phraseGood: 70, ...over });

describe('badges from stored results only', () => {
  it('nothing stored, no badges', () => {
    expect(earnedBadges(ctx())).toEqual([]);
  });
  it('7 days in a row — a gap breaks the run', () => {
    const days = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06'];
    expect(longestRun(days)).toBe(6);
    expect(longestRun([...days, '2026-10-08'])).toBe(6);
    expect(longestRun([...days, '2026-10-07', '2026-10-07'])).toBe(7);
    const e = earnedBadges(ctx({ results: [...days, '2026-10-07'].map((d) => r('match', 10, d)) }));
    expect(e).toContain('streak7');
    expect(e).toContain('streak3');
    expect(e).toContain('first');
  });
  it('first octave of range, all basics lessons, a maqam mastered, rhythm 90%', () => {
    expect(earnedBadges(ctx({ range: { low: 55, high: 66, voiceType: 'alto', date: '' } }))).not.toContain('octave');
    expect(earnedBadges(ctx({ range: { low: 55, high: 67, voiceType: 'alto', date: '' } }))).toContain('octave');
    const ten = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`l${i}`, '2026-10-01']));
    expect(earnedBadges(ctx({ lessonsDone: ten }))).toContain('basics');
    expect(earnedBadges(ctx({ lessonsDone: { a: 'x' } }))).not.toContain('basics');
    expect(earnedBadges(ctx({ results: [r('maqam', 89)] }))).not.toContain('maqam');
    expect(earnedBadges(ctx({ results: [r('maqam', 90)] }))).toContain('maqam');
    expect(earnedBadges(ctx({ results: [r('rhythm', 92)] }))).toContain('rhythm');
  });
  it('first song learned phrase by phrase: every phrase reached the mark', () => {
    expect(earnedBadges(ctx({ phraseProgress: [{ phrases: 3, best: [80, 75] }] }))).not.toContain('song');
    expect(earnedBadges(ctx({ phraseProgress: [{ phrases: 3, best: [80, 75, 69] }] }))).not.toContain('song');
    expect(earnedBadges(ctx({ phraseProgress: [{ phrases: 3, best: [80, 75, 70] }] }))).toContain('song');
  });
  it('only new badges are celebrated; ids are unique', () => {
    expect(newBadges(['first', 'maqam'], ['first'])).toEqual(['maqam']);
    expect(new Set(BADGES.map((b) => b.id)).size).toBe(BADGES.length);
  });
});

describe('daily challenge', () => {
  it('level from her history', () => {
    expect(challengeLevel([], 0, 10)).toBe(1);
    expect(challengeLevel([], 5, 10)).toBe(2);
    const month = Array.from({ length: 20 }, (_, i) => r('match', 50, `2026-09-${String(i + 1).padStart(2, '0')}`));
    expect(challengeLevel(month, 10, 10)).toBe(3);
  });
  it('the same challenge all day, from her level or the one below, and it changes across days', () => {
    expect(dailyChallenge('2026-10-21', 2)).toEqual(dailyChallenge('2026-10-21', 2));
    for (let d = 1; d <= 28; d++) {
      const c = dailyChallenge(`2026-10-${String(d).padStart(2, '0')}`, 1);
      expect(c.level).toBe(1);
    }
    const seen = new Set(Array.from({ length: 28 }, (_, d) => dailyChallenge(`2026-10-${String(d + 1).padStart(2, '0')}`, 3).id));
    expect(seen.size).toBeGreaterThan(3);
    for (const c of CHALLENGES) expect(c.href.startsWith('#/')).toBe(true);
  });
  it('done automatically when today has a result of that kind reaching the goal', () => {
    const c = CHALLENGES.find((x) => x.id === 'match60')!;
    expect(challengeDone(c, [r('match', 59, '2026-10-21')], '2026-10-21')).toBe(false);
    expect(challengeDone(c, [r('match', 60, '2026-10-20')], '2026-10-21')).toBe(false); // yesterday doesn't count
    expect(challengeDone(c, [r('match', 60, '2026-10-21')], '2026-10-21')).toBe(true);
    expect(challengeDone(c, [r('ear-pitch', 90, '2026-10-21')], '2026-10-21')).toBe(false);
  });
});
