// "🎓 كورس الصوت" rules, pure: passing an exercise (its goal on 2 different days), opening the next level (80% of
// this one, or the placement check), today's workout from her level, and her saved progress (a pref, so it's in the
// backup and in sync like the other settings).

import { COURSE, type CourseExercise, type CourseGoal, type CourseLevel } from '../content/course';
import { getPref, getResults, setPref, today, type Result } from './storage';

/** Days an exercise's goal must be met on (separate days: consolidation, not luck). */
export const PASS_DAYS = 2;
/** Share of a level's exercises that opens the next one. */
export const UNLOCK_SHARE = 0.8;
/** A phrase in the song loop counts at this score (LearnSongPage's PHRASE_GOOD). */
export const SONG_PHRASE_GOOD = 70;

export interface CourseProgress {
  /** exercise id → days its goal was met (YYYY-MM-DD, sorted, no repeats) */
  passes: Record<string, string[]>;
  /** level number → day it was passed by the placement check */
  placed: Record<string, string>;
  /** level number → day it opened (for the progress line) */
  reached: Record<string, string>;
  /** day the graduation song was finished */
  graduated?: string;
}

const PREF = 'course';
export const COURSE_KEY = 'soty.pref.' + PREF;

export const emptyProgress = (): CourseProgress => ({ passes: {}, placed: {}, reached: {} });

const isDay = (d: unknown): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
const dayMap = (v: unknown): Record<string, string> => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).filter(([, d]) => isDay(d))) : {});

/** Her saved progress, whatever shape it's in (missing, old or broken → a fresh start; nothing throws). */
export function parseProgress(raw: string | null): CourseProgress {
  try {
    const v = JSON.parse(raw ?? 'null');
    if (!v || typeof v !== 'object') return emptyProgress();
    const passes: Record<string, string[]> = {};
    if (v.passes && typeof v.passes === 'object')
      for (const [id, days] of Object.entries(v.passes)) if (Array.isArray(days)) passes[id] = [...new Set(days.filter(isDay))].sort();
    return { passes, placed: dayMap(v.placed), reached: dayMap(v.reached), ...(isDay(v.graduated) ? { graduated: v.graduated } : {}) };
  } catch {
    return emptyProgress();
  }
}

/** Two copies (two devices, or a backup merged in): every pass day kept, the earliest date of each milestone. */
export function mergeProgress(a: CourseProgress, b: CourseProgress): CourseProgress {
  const passes: Record<string, string[]> = { ...a.passes };
  for (const [id, days] of Object.entries(b.passes)) passes[id] = [...new Set([...(passes[id] ?? []), ...days])].sort();
  const early = (x: Record<string, string>, y: Record<string, string>) => {
    const out = { ...x };
    for (const [k, d] of Object.entries(y)) if (!out[k] || d < out[k]) out[k] = d;
    return out;
  };
  const graduated = [a.graduated, b.graduated].filter(isDay).sort()[0];
  return { passes, placed: early(a.placed, b.placed), reached: early(a.reached, b.reached), ...(graduated ? { graduated } : {}) };
}

export const getCourse = (): CourseProgress => parseProgress(getPref(PREF));
const saveCourse = (p: CourseProgress) => setPref(PREF, JSON.stringify(p));

// ---- the course definition

export const ALL_EXERCISES: CourseExercise[] = COURSE.flatMap((l) => l.exercises);
export const exerciseById = (id: string) => ALL_EXERCISES.find((e) => e.id === id);
export const levelOf = (id: string): CourseLevel | undefined => COURSE.find((l) => l.exercises.some((e) => e.id === id));
export const levelByN = (n: number) => COURSE.find((l) => l.n === n);

// ---- goals

/** What an exercise reports after a go: the main number, and attempts when the goal needs them. */
export interface CourseMeasure {
  value: number;
  tries?: number;
}

export function meetsGoal(goal: CourseGoal, m: CourseMeasure): boolean {
  switch (goal.kind) {
    case 'seconds':
      return m.value >= goal.min;
    case 'cents':
      return m.value <= goal.max;
    case 'notes':
    case 'phrases':
      return m.value >= goal.min;
    case 'percent':
      return m.value >= goal.min && (m.tries ?? 0) >= (goal.tries ?? 0);
  }
}

const AR = '٠١٢٣٤٥٦٧٨٩';
export const ar = (n: number | string) => String(n).replace(/\d/g, (d) => AR[Number(d)]);
const secondsAr = (n: number) => (n <= 10 ? `${ar(n)} ثواني` : `${ar(n)} ثانية`);

/** The goal in one short line, shown before she starts, e.g. "٧ من ٩ نغمات مظبوطة في مرة واحدة". */
export function goalText(goal: CourseGoal): string {
  switch (goal.kind) {
    case 'seconds':
      return `${secondsAr(goal.min)} أو أكتر في مرة واحدة`;
    case 'cents':
      return `${ar(goal.max)} سنت أو أقل`;
    case 'notes':
      return `${ar(goal.min)} من ${ar(goal.of)} نغمات مظبوطة في مرة واحدة`;
    case 'percent':
      return goal.tries ? `${ar(goal.min)}٪ صح أو أكتر، في ${ar(goal.tries)} محاولات على الأقل` : `${ar(goal.min)}٪ أو أكتر`;
    case 'phrases':
      return `${ar(goal.min)} جمل من الأغنية توصل ${ar(SONG_PHRASE_GOOD)}٪ في نفس اليوم`;
  }
}

// ---- passing and opening

export const passDays = (p: CourseProgress, id: string) => p.passes[id]?.length ?? 0;
export const isPassed = (p: CourseProgress, id: string) => passDays(p, id) >= PASS_DAYS || isPlacedExercise(p, id);
const isPlacedExercise = (p: CourseProgress, id: string) => {
  const l = levelOf(id);
  return !!l && !!p.placed[l.n];
};

/** How many of a level's exercises open the next one (most of them: 80%, rounded). */
export const neededToPass = (l: CourseLevel) => Math.max(1, Math.round(l.exercises.length * UNLOCK_SHARE));
export const passedCount = (p: CourseProgress, l: CourseLevel) => l.exercises.filter((e) => isPassed(p, e.id)).length;
export const levelDone = (p: CourseProgress, l: CourseLevel) => !!p.placed[l.n] || passedCount(p, l) >= neededToPass(l);

/** Level 1 is always open; each next level opens when the one before it is done. Opened levels stay open. */
export function isOpen(p: CourseProgress, n: number): boolean {
  if (n <= 1) return true;
  const prev = levelByN(n - 1);
  return !!prev && isOpen(p, n - 1) && levelDone(p, prev);
}

/** Her level: the first one that isn't done yet (8 when everything is). */
export function currentLevel(p: CourseProgress): number {
  for (const l of COURSE) if (!levelDone(p, l)) return l.n;
  return COURSE[COURSE.length - 1].n;
}

/** Every level done: the graduation song is open. */
export const graduationOpen = (p: CourseProgress) => COURSE.every((l) => levelDone(p, l));

/** Notes newly opened levels (the progress line). */
function markReached(p: CourseProgress, day: string): CourseProgress {
  const reached = { ...p.reached };
  for (const l of COURSE) if (isOpen(p, l.n) && !reached[l.n]) reached[l.n] = day;
  return { ...p, reached };
}

/** Records that an exercise's goal was met today (once per day). */
export function withPass(p: CourseProgress, id: string, day: string): CourseProgress {
  const days = p.passes[id] ?? [];
  if (days.includes(day)) return markReached(p, day);
  return markReached({ ...p, passes: { ...p.passes, [id]: [...days, day].sort() } }, day);
}

/** The placement check ("امتحنيني"): her current level counts as passed. Only her current level can be examined. */
export function withPlacement(p: CourseProgress, n: number, day: string): CourseProgress {
  if (n !== currentLevel(p) || levelDone(p, levelByN(n)!)) return p;
  return markReached({ ...p, placed: { ...p.placed, [n]: day } }, day);
}

/** The exercises the placement check asks for (the song isn't part of it: it needs a file and a whole session). */
export const placementExercises = (l: CourseLevel) => l.exercises.filter((e) => e.daily !== false);

/** The check passes when every one of those goals was met during it. */
export const placementPassed = (l: CourseLevel, met: Set<string>) => placementExercises(l).every((e) => met.has(e.id));

// ---- saving (the page calls these)

export function recordPass(id: string, day = today()): CourseProgress {
  const p = withPass(getCourse(), id, day);
  saveCourse(p);
  return p;
}

export function recordPlacement(n: number, day = today()): CourseProgress {
  const p = withPlacement(getCourse(), n, day);
  saveCourse(p);
  return p;
}

export function recordGraduation(day = today()): CourseProgress {
  const p = getCourse();
  if (p.graduated) return p;
  const next = { ...p, graduated: day };
  saveCourse(next);
  return next;
}

/** First visit: level 1 opened today. */
export function startCourse(day = today()): CourseProgress {
  const p = getCourse();
  if (p.reached[1]) return p;
  const next = markReached(p, day);
  saveCourse(next);
  return next;
}

// ---- songs (the phrase loop saves a "loop" result per phrase repeat: "<song> — جملة N: …")

/** Different phrases of one song that reached the goal on a day. */
export function songPhrasesOnDay(results: Result[], songId: string, day: string): number {
  const phrases = new Set<string>();
  for (const r of results) {
    if (r.type !== 'loop' || r.songId !== songId || r.date !== day || r.value < SONG_PHRASE_GOOD) continue;
    const m = /جملة (\d+)/.exec(r.detail ?? '');
    if (m) phrases.add(m[1]);
  }
  return phrases.size;
}

/** Best of all her songs today (the song exercise's measure). */
export function bestSongToday(results = getResults(), day = today()): { songId: string; phrases: number } | null {
  const ids = [...new Set(results.filter((r) => r.type === 'loop' && r.songId && r.date === day).map((r) => r.songId!))];
  let best: { songId: string; phrases: number } | null = null;
  for (const id of ids) {
    const n = songPhrasesOnDay(results, id, day);
    if (!best || n > best.phrases) best = { songId: id, phrases: n };
  }
  return best;
}

// ---- today's workout

export type CoursePlanItem = { step: 'warmup'; minutes: number } | { step: 'course'; id: string; minutes: number; review: boolean };

/**
 * Today's workout from her course level: the warm-up, 2–3 exercises of her current level (the ones not passed yet
 * first), then one review exercise from an earlier level — about 12–15 minutes. A light day (a bit tired after the
 * last one): a shorter warm-up, one exercise and one review, nothing at the edges of her voice (about 6 minutes).
 * Never an exercise from a level she hasn't reached; songs are never in it.
 */
export function courseWorkout(p: CourseProgress, light: boolean, workoutsDone: number): CoursePlanItem[] {
  const level = levelByN(currentLevel(p))!;
  const ok = (e: CourseExercise) => e.daily !== false && !(light && e.strain);
  const here = level.exercises.filter(ok);
  // not passed first (fewest good days first), then the rest; a different start each day among equals
  const rank = (e: CourseExercise) => (isPassed(p, e.id) ? 100 : 0) + passDays(p, e.id);
  const rotated = here.map((e, i) => ({ e, i: (i - (workoutsDone % Math.max(1, here.length)) + here.length) % here.length }));
  const ordered = rotated.sort((a, b) => rank(a.e) - rank(b.e) || a.i - b.i).map((x) => x.e);
  const earlier = COURSE.filter((l) => l.n < level.n).flatMap((l) => l.exercises.filter(ok));
  const review = earlier.length ? earlier[workoutsDone % earlier.length] : null;
  const count = light ? 1 : Math.min(3, ordered.length);
  // keep the course order inside today's workout (easier first)
  const main = ordered.slice(0, count).sort((a, b) => here.indexOf(a) - here.indexOf(b));
  const plan: CoursePlanItem[] = [{ step: 'warmup', minutes: light ? 2 : 3 }, ...main.map((e) => ({ step: 'course' as const, id: e.id, minutes: light ? 2 : 3, review: false }))];
  if (review) plan.push({ step: 'course', id: review.id, minutes: 2, review: true });
  return plan;
}

/** "المستوى ٣ من ٨ · ٢ من ٤ تمارين" for the path and the home screen. */
export function courseLine(p: CourseProgress): string {
  const l = levelByN(currentLevel(p))!;
  if (graduationOpen(p)) return p.graduated ? '🎓 اتخرجتي من كورس الصوت' : `🎓 كورس الصوت: فاضل التخرج`;
  return `🎓 المستوى ${ar(l.n)} من ${ar(COURSE.length)}: ${l.title} · ${ar(passedCount(p, l))} من ${ar(l.exercises.length)} تمارين`;
}
