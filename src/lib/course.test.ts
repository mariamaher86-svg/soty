// The voice course: its definition, passing on 2 days, opening levels at 80%, the placement check, today's workout
// from her level, and her progress (parse, merge, sync, backup).

import { describe, expect, it } from 'vitest';
import { COURSE, GRADUATION, type CourseExercise } from '../content/course';
import { VIDEOS } from '../content/videos';
import { DYNAMICS_KINDS } from './dynamics';
import { INTERVAL_LEVELS } from './intervalSing';
import { MAQAMAT } from './maqam';
import { patternSteps, vocaliseById } from './pianoVocalise';
import {
  ALL_EXERCISES,
  COURSE_KEY,
  courseWorkout,
  currentLevel,
  emptyProgress,
  goalText,
  graduationOpen,
  isOpen,
  isPassed,
  levelByN,
  levelDone,
  meetsGoal,
  mergeProgress,
  neededToPass,
  parseProgress,
  placementExercises,
  placementPassed,
  songPhrasesOnDay,
  withPass,
  withPlacement,
  type CourseProgress,
} from './course';
import { mergeDoc, syncableKey } from './sync';
import { buildBackup, planStorage } from './backup';
import type { Result } from './storage';

// all app source as text (for the quoted button labels)
const files = import.meta.glob('/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const UI = Object.entries(files)
  .filter(([path]) => !path.includes('/content/course') && !path.includes('/content/help') && !path.endsWith('.test.ts') && !path.endsWith('.test.tsx'))
  .map(([, t]) => t)
  .join(' ');

/** Passes every exercise of levels 1..n on two days. */
function passedUpTo(n: number): CourseProgress {
  let p = emptyProgress();
  for (const l of COURSE.filter((x) => x.n <= n)) for (const e of l.exercises) p = withPass(withPass(p, e.id, '2026-11-01'), e.id, '2026-11-02');
  return p;
}

/** Passes the first k exercises of a level (on two days). */
function passSome(p: CourseProgress, n: number, k: number): CourseProgress {
  for (const e of levelByN(n)!.exercises.slice(0, k)) p = withPass(withPass(p, e.id, '2026-11-03'), e.id, '2026-11-04');
  return p;
}

const lengthOf = (e: CourseExercise) => {
  if (e.engine.kind === 'pattern') return patternSteps({ kind: 'vocalise', id: e.engine.pattern }, 60).length;
  if (e.engine.kind === 'maqamScale') {
    const id = e.engine.maqam;
    return patternSteps({ kind: 'maqam', maqam: MAQAMAT.find((m) => m.id === id)! }, 60).length;
  }
  if (e.engine.kind === 'ladder') return 9;
  return null;
};

describe('the course definition', () => {
  it('8 levels in order, each with a goal, a "why" and 3–6 exercises; ids are unique', () => {
    expect(COURSE.map((l) => l.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    for (const l of COURSE) {
      expect(l.title.length).toBeGreaterThan(3);
      expect(l.goal.length).toBeGreaterThan(15);
      expect(l.why.length).toBeGreaterThan(15);
      expect(l.exercises.length).toBeGreaterThanOrEqual(3);
      expect(l.exercises.length).toBeLessThanOrEqual(6);
    }
    expect(new Set(ALL_EXERCISES.map((e) => e.id)).size).toBe(ALL_EXERCISES.length);
    expect(GRADUATION.how.length).toBeGreaterThanOrEqual(2);
  });

  it('from simplest to hardest: breath and one note first, then the ladder, ... maqamat and a song last; the high/low level has its safety note', () => {
    expect(COURSE[0].exercises.map((e) => e.engine.kind)).toEqual(['hiss', 'sustain', 'match']);
    expect(COURSE[1].exercises.some((e) => e.engine.kind === 'ladder')).toBe(true);
    expect(COURSE[7].exercises.some((e) => e.engine.kind === 'maqamScale')).toBe(true);
    expect(COURSE[7].exercises.at(-1)!.engine.kind).toBe('song');
    expect(COURSE[6].care).toMatch(/متزقيش/);
    // edges of the voice only in level 7
    for (const e of ALL_EXERCISES) if (e.engine.kind === 'pattern' && e.engine.zone) expect(e.strain).toBe(true);
    expect(COURSE.filter((l) => l.exercises.some((e) => e.strain)).map((l) => l.n)).toEqual([7]);
  });

  it('every exercise runs an existing engine, has a goal, a one-line "what", 2–4 steps and a video search', () => {
    for (const e of ALL_EXERCISES) {
      expect(e.what.length, e.id).toBeGreaterThan(15);
      expect(e.how.length, e.id).toBeGreaterThanOrEqual(2);
      expect(e.how.length, e.id).toBeLessThanOrEqual(4);
      expect(VIDEOS[e.video], e.id).toBeTruthy();
      expect(goalText(e.goal).length, e.id).toBeGreaterThan(5);
      const en = e.engine;
      if (en.kind === 'pattern') expect(vocaliseById(en.pattern), e.id).toBeTruthy();
      if (en.kind === 'maqamScale') expect(MAQAMAT.some((m) => m.id === en.maqam), e.id).toBe(true);
      if (en.kind === 'intervals') expect(INTERVAL_LEVELS[en.level], e.id).toBeTruthy();
      if (en.kind === 'dynamics') expect(DYNAMICS_KINDS.some((k) => k.id === en.shape), e.id).toBe(true);
      // a goal in notes counts the real notes of that pattern
      if (e.goal.kind === 'notes') {
        expect(lengthOf(e), e.id).toBe(e.goal.of);
        expect(e.goal.min).toBeLessThanOrEqual(e.goal.of);
      }
      if (en.kind === 'song') expect(e.daily).toBe(false);
    }
  });

  it('every «quoted» button label in the steps exists in the app', () => {
    const missing: string[] = [];
    for (const t of [...ALL_EXERCISES.flatMap((e) => e.how), ...GRADUATION.how]) for (const m of t.matchAll(/«([^»]+)»/g)) if (!UI.includes(m[1])) missing.push(m[1]);
    expect(missing).toEqual([]);
  });

  it('goals in plain words, in Arabic digits', () => {
    expect(goalText({ kind: 'notes', min: 7, of: 9 })).toBe('٧ من ٩ نغمات مظبوطة في مرة واحدة');
    expect(goalText({ kind: 'seconds', min: 8 })).toBe('٨ ثواني أو أكتر في مرة واحدة');
    expect(goalText({ kind: 'seconds', min: 20 })).toBe('٢٠ ثانية أو أكتر في مرة واحدة');
    expect(goalText({ kind: 'percent', min: 70, tries: 5 })).toBe('٧٠٪ صح أو أكتر، في ٥ محاولات على الأقل');
    expect(goalText({ kind: 'cents', max: 25 })).toBe('٢٥ سنت أو أقل');
  });

  it('meeting a goal', () => {
    expect(meetsGoal({ kind: 'seconds', min: 8 }, { value: 8 })).toBe(true);
    expect(meetsGoal({ kind: 'seconds', min: 8 }, { value: 7.9 })).toBe(false);
    expect(meetsGoal({ kind: 'cents', max: 25 }, { value: 30 })).toBe(false);
    expect(meetsGoal({ kind: 'notes', min: 7, of: 9 }, { value: 7 })).toBe(true);
    expect(meetsGoal({ kind: 'percent', min: 70, tries: 5 }, { value: 100, tries: 2 })).toBe(false); // lucky first tries
    expect(meetsGoal({ kind: 'percent', min: 70, tries: 5 }, { value: 80, tries: 5 })).toBe(true);
    expect(meetsGoal({ kind: 'percent', min: 60 }, { value: 60 })).toBe(true);
  });
});

describe('passing and opening levels', () => {
  it('an exercise passes with its goal on 2 different days, not twice the same day', () => {
    let p = withPass(emptyProgress(), 'l1-breath', '2026-11-10');
    p = withPass(p, 'l1-breath', '2026-11-10');
    expect(p.passes['l1-breath']).toEqual(['2026-11-10']);
    expect(isPassed(p, 'l1-breath')).toBe(false);
    p = withPass(p, 'l1-breath', '2026-11-12');
    expect(isPassed(p, 'l1-breath')).toBe(true);
  });

  it('level 1 is open; the next level opens at 80% of this one (rounded), and earlier levels stay open', () => {
    expect(COURSE.map((l) => neededToPass(l))).toEqual(COURSE.map((l) => Math.round(l.exercises.length * 0.8)));
    expect(neededToPass(levelByN(4)!)).toBe(4); // 4 of 5
    let p = emptyProgress();
    expect(isOpen(p, 1)).toBe(true);
    expect(isOpen(p, 2)).toBe(false);
    expect(currentLevel(p)).toBe(1);
    p = passSome(p, 1, 2); // 2 of 3 = most of level 1 (80% of 3, rounded)
    expect(levelDone(p, levelByN(1)!)).toBe(true);
    expect(isOpen(p, 2)).toBe(true);
    expect(currentLevel(p)).toBe(2);
    p = passSome(p, 2, 2); // 2 of 4: not yet
    expect(isOpen(p, 3)).toBe(false);
    p = passSome(p, 2, 3);
    expect(isOpen(p, 3)).toBe(true);
    expect(isOpen(p, 1) && isOpen(p, 2)).toBe(true);
    expect(isOpen(p, 4)).toBe(false);
  });

  it('remembers the day each level opened (for the progress line)', () => {
    const p = passSome(passSome(emptyProgress(), 1, 3), 2, 3);
    expect(p.reached).toEqual({ 1: '2026-11-03', 2: '2026-11-04', 3: '2026-11-04' });
  });

  it('graduation opens when all 8 levels are done', () => {
    expect(graduationOpen(passedUpTo(7))).toBe(false);
    expect(graduationOpen(passedUpTo(8))).toBe(true);
  });
});

describe('the placement check ("امتحنيني")', () => {
  it('passes her current level when every goal was met in it (the song is not part of it)', () => {
    const l8 = levelByN(8)!;
    expect(placementExercises(l8).some((e) => e.engine.kind === 'song')).toBe(false);
    const l1 = levelByN(1)!;
    const all = new Set(l1.exercises.map((e) => e.id));
    expect(placementPassed(l1, all)).toBe(true);
    expect(placementPassed(l1, new Set([...all].slice(1)))).toBe(false);
    const p = withPlacement(emptyProgress(), 1, '2026-11-15');
    expect(levelDone(p, l1)).toBe(true);
    expect(isPassed(p, 'l1-match')).toBe(true);
    expect(currentLevel(p)).toBe(2);
    expect(p.reached[2]).toBe('2026-11-15');
  });

  it('can never skip ahead: only her current level can be examined', () => {
    expect(withPlacement(emptyProgress(), 3, '2026-11-15')).toEqual(emptyProgress());
    // chain: level 1 by exam, then level 2 by exam
    const p = withPlacement(withPlacement(emptyProgress(), 1, '2026-11-15'), 2, '2026-11-15');
    expect(currentLevel(p)).toBe(3);
  });
});

describe("today's workout from her level", () => {
  const ids = (plan: ReturnType<typeof courseWorkout>) => plan.filter((s) => s.step === 'course').map((s) => (s as { id: string }).id);

  it('warm-up, then 3 of her level (not passed first), then one review from an earlier level: about 12–15 minutes', () => {
    const p = passedUpTo(2); // level 3 now
    const plan = courseWorkout(p, false, 4);
    expect(plan[0].step).toBe('warmup');
    const l3 = levelByN(3)!.exercises.map((e) => e.id);
    const main = plan.filter((s) => s.step === 'course' && !s.review).map((s) => (s as { id: string }).id);
    expect(main).toHaveLength(3);
    expect(main.every((id) => l3.includes(id))).toBe(true);
    const review = plan.filter((s) => s.step === 'course' && s.review);
    expect(review).toHaveLength(1);
    expect([...levelByN(1)!.exercises, ...levelByN(2)!.exercises].map((e) => e.id)).toContain((review[0] as { id: string }).id);
    const minutes = plan.reduce((a, s) => a + s.minutes, 0);
    expect(minutes).toBeGreaterThanOrEqual(10);
    expect(minutes).toBeLessThanOrEqual(15);
    // the exercise she already passed waits until the others are done
    const p2 = passSome(p, 3, 1);
    expect(ids(courseWorkout(p2, false, 0))).not.toContain(l3[0]);
  });

  it('level 1: no review yet; the review rotates day by day', () => {
    expect(ids(courseWorkout(emptyProgress(), false, 0))).toEqual(['l1-breath', 'l1-hum', 'l1-match']);
    const p = passedUpTo(3);
    const reviews = new Set([0, 1, 2, 3, 4].map((d) => courseWorkout(p, false, d).at(-1)!).map((s) => (s as { id: string }).id));
    expect(reviews.size).toBe(5);
  });

  it('a light day: short warm-up, one exercise and one review, nothing at the edges of her voice (about 6 minutes)', () => {
    const p = passedUpTo(6); // level 7: the high/low level
    const plan = courseWorkout(p, true, 2);
    expect(plan.map((s) => s.step)).toEqual(['warmup', 'course', 'course']);
    expect(plan.reduce((a, s) => a + s.minutes, 0)).toBeLessThanOrEqual(7);
    for (const id of ids(plan)) expect(ALL_EXERCISES.find((e) => e.id === id)!.strain).toBeFalsy();
    for (let d = 0; d < 10; d++) for (const id of ids(courseWorkout(p, true, d))) expect(ALL_EXERCISES.find((e) => e.id === id)!.strain, id).toBeFalsy();
  });

  it('never a level she has not reached, and never the song', () => {
    for (let n = 0; n <= 8; n++) {
      const p = n ? passedUpTo(n) : emptyProgress();
      const cur = currentLevel(p);
      for (let d = 0; d < 12; d++)
        for (const id of ids(courseWorkout(p, false, d))) {
          const lvl = COURSE.find((l) => l.exercises.some((e) => e.id === id))!.n;
          expect(lvl).toBeLessThanOrEqual(cur);
          expect(ALL_EXERCISES.find((e) => e.id === id)!.daily).not.toBe(false);
        }
    }
  });
});

describe('songs in the course', () => {
  it('counts different phrases of one song that reached 70% on that day', () => {
    const r = (value: number, detail: string, date = '2026-11-15', songId = 's1'): Result => ({ type: 'loop', value, detail, date, ts: 0, songId });
    const results = [r(80, 'أغنيتي — جملة 1: …'), r(90, 'أغنيتي — جملة 1: …'), r(75, 'أغنيتي — جملة 2: …'), r(60, 'أغنيتي — جملة 3: …'), r(95, 'أغنيتي — جملة 4: …', '2026-11-14'), r(95, 'تانية — جملة 5: …', '2026-11-15', 's2')];
    expect(songPhrasesOnDay(results, 's1', '2026-11-15')).toBe(2);
  });
});

describe('her course progress: storage, backup, sync', () => {
  it('reads anything safely: nothing saved, broken JSON, old shapes', () => {
    expect(parseProgress(null)).toEqual(emptyProgress());
    expect(parseProgress('{oops')).toEqual(emptyProgress());
    expect(parseProgress('[1,2]')).toEqual(emptyProgress());
    expect(parseProgress(JSON.stringify({ passes: { a: ['2026-11-02', 'junk', '2026-11-01', '2026-11-02'] }, placed: { 1: 5 } }))).toEqual({ passes: { a: ['2026-11-01', '2026-11-02'] }, placed: {}, reached: {} });
  });

  it('two devices merge: every good day kept, the earliest milestones', () => {
    const a: CourseProgress = { passes: { x: ['2026-11-01'] }, placed: { 1: '2026-11-05' }, reached: { 1: '2026-11-01', 2: '2026-11-05' } };
    const b: CourseProgress = { passes: { x: ['2026-11-03'], y: ['2026-11-03'] }, placed: { 1: '2026-11-04' }, reached: { 1: '2026-11-02' }, graduated: '2026-12-01' };
    expect(mergeProgress(a, b)).toEqual({ passes: { x: ['2026-11-01', '2026-11-03'], y: ['2026-11-03'] }, placed: { 1: '2026-11-04' }, reached: { 1: '2026-11-01', 2: '2026-11-05' }, graduated: '2026-12-01' });
  });

  it('is synced (one doc per key, like the other settings) and both sides merge instead of one winning', () => {
    expect(COURSE_KEY).toBe('soty.pref.course');
    expect(syncableKey(COURSE_KEY)).toBe(true);
    const phone = JSON.stringify({ passes: { 'l1-breath': ['2026-11-10'] }, placed: {}, reached: {} });
    const tablet = JSON.stringify({ passes: { 'l1-breath': ['2026-11-12'] }, placed: {}, reached: {} });
    expect(parseProgress(mergeDoc(COURSE_KEY, phone, tablet)).passes['l1-breath']).toEqual(['2026-11-10', '2026-11-12']);
  });

  it('is in the backup, and a "merge" restore keeps the days from both', () => {
    const mine = JSON.stringify({ passes: { 'l1-hum': ['2026-11-10'] }, placed: {}, reached: {} });
    const backup = buildBackup({ 'soty.v1': '{"results":[]}', [COURSE_KEY]: JSON.stringify({ passes: { 'l1-hum': ['2026-11-11'] }, placed: {}, reached: {} }) }, [], new Date(), []);
    expect(backup.storage[COURSE_KEY]).toBeTruthy();
    const plan = planStorage({ [COURSE_KEY]: mine }, backup, 'merge');
    expect(parseProgress(plan.set[COURSE_KEY]).passes['l1-hum']).toEqual(['2026-11-10', '2026-11-11']);
    expect(parseProgress(planStorage({ [COURSE_KEY]: mine }, backup, 'replace').set[COURSE_KEY]).passes['l1-hum']).toEqual(['2026-11-11']);
  });
});
