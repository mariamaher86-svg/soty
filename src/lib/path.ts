// Beginner path ("مسار المبتدئ"): pure rules for the daily plan, weekly checks, streaks and comparisons.

/** One full measurement (starting one and every weekly check). */
export interface Measurement {
  date: string; // YYYY-MM-DD
  /** MIDI; null = not measured this time (older records may have 0 = junk) */
  rangeLow: number | null;
  rangeHigh: number | null;
  /** median |cents| off while trying to match a note (lower = better) */
  matchCents: number | null;
  /** seconds from hearing a note to locking onto it (lower = better) */
  matchLockSec: number | null;
  sustainSec: number | null;
  /** pitch spread in cents (lower = better) */
  stabilityCents: number | null;
  hissSec: number | null;
}

export type Feeling = 'no' | 'little' | 'yes';

export interface WorkoutLog {
  date: string;
  maqam: string;
  feeling: Feeling | null;
  /** steps with real results (newer logs only; older logs are checked against that day's results) */
  done?: number;
}

const DAY = 86400000;
const toDay = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));

/** Whole days from a to b (both YYYY-MM-DD). */
export function daysBetween(a: string, b: string): number {
  return Math.round((toDay(b) - toDay(a)) / DAY);
}

/** Maqamat get unlocked slowly: easy ones first, then Rast, Bayati, Hijaz. */
export const MAQAM_STAGES: { afterWorkouts: number; ids: string[] }[] = [
  { afterWorkouts: 0, ids: ['ajam', 'nahawand'] },
  { afterWorkouts: 6, ids: ['ajam', 'nahawand', 'rast'] },
  { afterWorkouts: 12, ids: ['ajam', 'nahawand', 'rast', 'bayati'] },
  { afterWorkouts: 18, ids: ['ajam', 'nahawand', 'rast', 'bayati', 'hijaz'] },
];

/** Today's maqam from how many workouts were already done (rotates day by day). */
export function todaysMaqam(workoutsDone: number): string {
  const stage = [...MAQAM_STAGES].reverse().find((s) => workoutsDone >= s.afterWorkouts)!;
  return stage.ids[workoutsDone % stage.ids.length];
}

/** Notes for beginners: the middle of the measured range, never the extremes. */
export function middleRange(low: number, high: number): { low: number; high: number } {
  const center = (low + high) / 2;
  const half = Math.max(3, (high - low) / 4); // middle half of the range, at least ±3 semitones
  return { low: Math.max(low, Math.round(center - half)), high: Math.min(high, Math.round(center + half)) };
}

/** A tonic whose octave sits around the middle of the range (for maqam exercises). */
export function middleTonic(low: number, high: number): number {
  const t = Math.round((low + high) / 2 - 6);
  return Math.max(low, Math.min(t, high - 12 >= low ? high - 12 : low));
}

export type WeeklyStatus = { kind: 'baseline' } | { kind: 'due' } | { kind: 'later'; inDays: number };

/** Is the weekly check due? Due when 7+ days have passed since the last measurement. */
export function weeklyStatus(lastMeasurementDate: string | null, today: string): WeeklyStatus {
  if (!lastMeasurementDate) return { kind: 'baseline' };
  const d = daysBetween(lastMeasurementDate, today);
  return d >= 7 ? { kind: 'due' } : { kind: 'later', inDays: 7 - d };
}

/** Days in a row with a workout, ending today — or yesterday, if today's isn't done yet. */
export function streak(workoutDates: string[], today: string): number {
  const days = new Set(workoutDates);
  let d = days.has(today) ? 0 : 1;
  if (d === 1 && !days.has(shiftDay(today, -1))) return 0;
  let n = 0;
  while (days.has(shiftDay(today, -d))) {
    n++;
    d++;
  }
  return n;
}

export function shiftDay(day: string, by: number): string {
  const d = new Date(toDay(day) + by * DAY);
  return d.toISOString().slice(0, 10);
}

/** Steps of today's workout (minutes are suggestions). Warm-up first, ears and intervals last. A lighter plan after a tired day. */
export function workoutPlan(light: boolean, lesson = false, findNote = false, rhythm = false): { step: 'lesson' | 'findnote' | 'warmup' | 'hiss' | 'match' | 'sustain' | 'maqam' | 'ear' | 'intervals' | 'rhythm'; minutes: number }[] {
  // first week, once "what is a note" is done: the guided note ladder instead of pitch matching
  if (findNote) return workoutPlan(light, lesson).map((s) => (s.step === 'match' ? { step: 'findnote' as const, minutes: s.minutes } : s));
  // while music-basics lessons remain: one lesson first, and interval singing waits until the basics are done
  if (lesson) return [{ step: 'lesson', minutes: 2 }, ...workoutPlan(light).filter((s) => s.step !== 'intervals')];
  // after the basics: every other day the last step is rhythm instead of intervals
  if (rhythm) return workoutPlan(light).map((s) => (s.step === 'intervals' ? { step: 'rhythm' as const, minutes: 2 } : s));
  if (light)
    return [
      { step: 'warmup', minutes: 2 },
      { step: 'match', minutes: 2 },
      { step: 'ear', minutes: 2 },
    ];
  return [
    { step: 'warmup', minutes: 3 },
    { step: 'hiss', minutes: 1 },
    { step: 'match', minutes: 2 },
    { step: 'sustain', minutes: 1 },
    { step: 'maqam', minutes: 2 },
    { step: 'ear', minutes: 2 },
    { step: 'intervals', minutes: 2 },
  ];
}

/** Basics done: rhythm days alternate with interval days. */
export const isRhythmDay = (workoutsDone: number) => workoutsDone % 2 === 1;

/** Lighter plan if the last workout (yesterday or today) felt a bit tiring. */
export function shouldGoLight(logs: WorkoutLog[], today: string): boolean {
  const last = logs[logs.length - 1];
  return !!last && last.feeling !== 'no' && last.feeling !== null && daysBetween(last.date, today) <= 1;
}

export type MeasureKey = 'range' | 'matchCents' | 'matchLockSec' | 'sustainSec' | 'stabilityCents' | 'hissSec';

export const MEASURES: { key: MeasureKey; ar: string; unit: string; higherIsBetter: boolean; same: number; up: string; down: string }[] = [
  { key: 'range', ar: 'المساحة الصوتية', unit: 'نصف تون', higherIsBetter: true, same: 1, up: 'زادت', down: 'قلت' },
  { key: 'matchCents', ar: 'النشاز', unit: 'سنت', higherIsBetter: false, same: 3, up: 'زاد', down: 'قل' },
  { key: 'matchLockSec', ar: 'وقت مسك النغمة', unit: 'ثانية', higherIsBetter: false, same: 0.4, up: 'زاد', down: 'قل' },
  { key: 'sustainSec', ar: 'النفس', unit: 'ثانية', higherIsBetter: true, same: 1, up: 'زاد', down: 'قل' },
  { key: 'stabilityCents', ar: 'اهتزاز الصوت', unit: 'سنت', higherIsBetter: false, same: 2, up: 'زاد', down: 'قل' },
  { key: 'hissSec', ar: 'السسسس', unit: 'ثانية', higherIsBetter: true, same: 1, up: 'زاد', down: 'قل' },
];

export function measureValue(m: Measurement, key: MeasureKey): number | null {
  if (key === 'range') return m.rangeLow && m.rangeHigh && m.rangeHigh > m.rangeLow ? m.rangeHigh - m.rangeLow : null;
  const v = m[key];
  // 0 = an old junk record (except lock time, where 0 s means she locked on at once)
  return v === null || v === undefined || (v === 0 && key !== 'matchLockSec') ? null : v;
}

const fmt = (v: number, key: MeasureKey) => {
  const r = key === 'matchLockSec' ? Math.round(v * 10) / 10 : Math.round(v);
  return key === 'matchCents' ? `±${r}` : String(r);
};

/** Plain-Arabic comparison of one measure, e.g. "النفس زاد من 8 لـ 14 ثانية 👏". */
export function compareMeasure(key: MeasureKey, before: number | null, after: number | null): { trend: 'better' | 'same' | 'worse'; ar: string } | null {
  if (before === null || after === null) return null;
  const m = MEASURES.find((x) => x.key === key)!;
  const diff = after - before;
  if (Math.abs(diff) < m.same) return { trend: 'same', ar: `${m.ar} زي ما هو تقريبًا (${fmt(after, key)} ${m.unit})` };
  const better = m.higherIsBetter ? diff > 0 : diff < 0;
  const verb = diff > 0 ? m.up : m.down;
  const text = `${m.ar} ${verb} من ${fmt(before, key)} لـ ${fmt(after, key)} ${m.unit}`;
  return better ? { trend: 'better', ar: text + ' 👏' } : { trend: 'worse', ar: text + ' — عادي، الأيام بتفرق؛ بصي على الاتجاه بتاع كذا أسبوع' };
}

/** All comparisons between two measurements. */
export function compareMeasurements(before: Measurement, after: Measurement) {
  return MEASURES.map((m) => compareMeasure(m.key, measureValue(before, m.key), measureValue(after, m.key))).filter((x) => x !== null);
}

/** A measurement with nothing real in it (every value empty or zero) — e.g. made by pressing "next" only. */
export function isEmptyMeasurement(m: Measurement | undefined | null): boolean {
  if (!m) return true;
  return MEASURES.every((x) => measureValue(m, x.key) === null);
}

/** The path as the app uses it: empty baseline/weekly records are ignored (kept in storage, never deleted). */
export function usableMeasurements<T extends { baseline?: Measurement; weekly: Measurement[] }>(p: T): T {
  return { ...p, baseline: isEmptyMeasurement(p.baseline) ? undefined : p.baseline, weekly: p.weekly.filter((w) => !isEmptyMeasurement(w)) };
}

/** Workout days that count: newer logs say how many steps were real; older ones count only if that day has real results. */
export function countedWorkouts(workouts: WorkoutLog[], resultDates: Set<string>): WorkoutLog[] {
  return workouts.filter((w) => (w.done !== undefined ? w.done > 0 : resultDates.has(w.date)));
}
