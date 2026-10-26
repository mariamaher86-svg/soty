// "🏆 الأوسمة والتحدي": a daily challenge picked from her level and marked done from her results, and badges
// computed only from what's already stored (results, range, lessons, song phrases) — nothing to cheat or forget.

import { shiftDay } from './path';
import type { Result, ResultType, SavedRange } from './storage';

export interface BadgeContext {
  results: Result[];
  range?: SavedRange;
  lessonsDone: Record<string, string>;
  lessonCount: number;
  /** per song: best score of each phrase, and how many phrases it has */
  phraseProgress: { phrases: number; best: number[] }[];
  /** days a daily challenge was completed */
  challengeDays: string[];
  phraseGood: number;
}

export interface Badge {
  id: string;
  icon: string;
  ar: string;
  /** how to get it (shown while locked) */
  how: string;
  earned: (c: BadgeContext) => boolean;
}

/** Longest run of consecutive days in a list of YYYY-MM-DD. */
export function longestRun(dates: string[]): number {
  const days = [...new Set(dates)].sort();
  let best = 0;
  let run = 0;
  for (let i = 0; i < days.length; i++) {
    run = i > 0 && shiftDay(days[i - 1], 1) === days[i] ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}

const has = (c: BadgeContext, type: ResultType, min: number) => c.results.some((r) => r.type === type && r.value >= min);

export const BADGES: Badge[] = [
  { id: 'first', icon: '🌱', ar: 'أول خطوة', how: 'أول تمرين بنتيجة.', earned: (c) => c.results.length > 0 },
  { id: 'streak3', icon: '🔥', ar: '٣ أيام ورا بعض', how: 'تمرين ٣ أيام متتالية.', earned: (c) => longestRun(c.results.map((r) => r.date)) >= 3 },
  { id: 'streak7', icon: '📅', ar: 'أسبوع كامل', how: 'تمرين ٧ أيام متتالية.', earned: (c) => longestRun(c.results.map((r) => r.date)) >= 7 },
  { id: 'octave', icon: '🎚️', ar: 'أوكتاف كامل', how: 'مساحة صوتك في الاختبار توصل أوكتاف (١٢ نص تون).', earned: (c) => !!c.range && c.range.high - c.range.low >= 12 },
  { id: 'basics', icon: '🎓', ar: 'الأساسيات كلها', how: 'نجاح في كل دروس أساسيات الموسيقى.', earned: (c) => c.lessonCount > 0 && Object.keys(c.lessonsDone).length >= c.lessonCount },
  { id: 'maqam', icon: '🎼', ar: 'مقام متقن', how: 'نتيجة ٩٠٪ أو أكتر في تمرين المقامات.', earned: (c) => has(c, 'maqam', 90) },
  { id: 'match', icon: '🎯', ar: 'ودن مظبوطة', how: 'نتيجة ٩٠٪ أو أكتر في مطابقة النغمة.', earned: (c) => has(c, 'match', 90) },
  {
    id: 'song',
    icon: '🎵',
    ar: 'أول أغنية جملة جملة',
    how: 'كل جمل أغنية واحدة توصل علامة ✔ في «تعلّمي الأغنية جملة جملة».',
    earned: (c) => c.phraseProgress.some((p) => p.phrases > 0 && p.best.length >= p.phrases && p.best.every((b) => b >= c.phraseGood)),
  },
  { id: 'rhythm', icon: '🥁', ar: 'على الضربة', how: 'نتيجة ٩٠٪ أو أكتر في الإيقاع.', earned: (c) => has(c, 'rhythm', 90) },
  { id: 'game', icon: '🎮', ar: 'العصفورة الطايرة', how: '١٠٠٠ نقطة في لعبة الصوت.', earned: (c) => has(c, 'game', 1000) },
  { id: 'dynamics', icon: '🎚️', ar: 'عالي وواطي بنعومة', how: 'نتيجة ٨٠٪ أو أكتر في العالي والواطي.', earned: (c) => has(c, 'dynamics', 80) },
  { id: 'pianoVocalise', icon: '🎹', ar: 'فوكاليز من غير غلطة', how: 'كل نغمات فوكاليز على البيانو مظبوطة في مرة واحدة.', earned: (c) => has(c, 'piano-vocalise', 100) },
  { id: 'challenge7', icon: '🏅', ar: '٧ تحديات', how: 'تخلّصي تحدي اليوم ٧ مرات.', earned: (c) => new Set(c.challengeDays).size >= 7 },
];

export function earnedBadges(c: BadgeContext): string[] {
  return BADGES.filter((b) => b.earned(c)).map((b) => b.id);
}

/** Badges earned that she hasn't seen celebrated yet. */
export function newBadges(earned: string[], seen: string[]): string[] {
  const s = new Set(seen);
  return earned.filter((id) => !s.has(id));
}

// ---- daily challenge

export type ChallengeLevel = 1 | 2 | 3;

export interface Challenge {
  id: string;
  ar: string;
  href: string;
  type: ResultType;
  goal: number;
  level: ChallengeLevel;
}

export const CHALLENGES: Challenge[] = [
  { id: 'match60', ar: 'مطابقة النغمة ٦٠٪ أو أكتر', href: '#/match', type: 'match', goal: 60, level: 1 },
  { id: 'ear70', ar: 'الودن: ٧٠٪ أو أكتر', href: '#/ear', type: 'ear-pitch', goal: 70, level: 1 },
  { id: 'sustain8', ar: 'نَفَس طويل: ٨ ثواني', href: '#/breath', type: 'sustain', goal: 8, level: 1 },
  { id: 'find3', ar: 'إزاي أجيب دو صح: ٣ نغمات', href: '#/findnote', type: 'findnote', goal: 3, level: 1 },
  { id: 'game300', ar: 'لعبة الصوت: ٣٠٠ نقطة', href: '#/game', type: 'game', goal: 300, level: 1 },
  { id: 'match80', ar: 'مطابقة النغمة ٨٠٪ أو أكتر', href: '#/match', type: 'match', goal: 80, level: 2 },
  { id: 'rhythm70', ar: 'الإيقاع: ٧٠٪ أو أكتر', href: '#/rhythm', type: 'rhythm', goal: 70, level: 2 },
  { id: 'intervals60', ar: 'غنا الفواصل: ٦٠٪ أو أكتر', href: '#/intervals', type: 'intervals', goal: 60, level: 2 },
  { id: 'vocalise70', ar: 'فوكاليز: ٧٠٪ أو أكتر', href: '#/vocalise', type: 'vocalise', goal: 70, level: 2 },
  { id: 'sustain15', ar: 'نَفَس طويل: ١٥ ثانية', href: '#/breath', type: 'sustain', goal: 15, level: 2 },
  { id: 'maqam80', ar: 'المقامات: ٨٠٪ أو أكتر', href: '#/maqam', type: 'maqam', goal: 80, level: 3 },
  { id: 'rhythm85', ar: 'الإيقاع: ٨٥٪ أو أكتر', href: '#/rhythm', type: 'rhythm', goal: 85, level: 3 },
  { id: 'game800', ar: 'لعبة الصوت: ٨٠٠ نقطة', href: '#/game', type: 'game', goal: 800, level: 3 },
  { id: 'pianovoc80', ar: 'فوكاليز على البيانو: ٨٠٪ أو أكتر', href: '#/piano/vocalise', type: 'piano-vocalise', goal: 80, level: 2 },
  { id: 'dynamics70', ar: 'العالي والواطي: ٧٠٪ أو أكتر', href: '#/dynamics', type: 'dynamics', goal: 70, level: 3 },
  { id: 'ear-maqam70', ar: 'الودن — أنهي مقام: ٧٠٪', href: '#/ear', type: 'ear-maqam', goal: 70, level: 3 },
];

/** Her level from her history: 1 = starting, 2 = basics mostly done or a few weeks of practice, 3 = all basics + a month. */
export function challengeLevel(results: Result[], lessonsDone: number, lessonCount: number): ChallengeLevel {
  const days = new Set(results.map((r) => r.date)).size;
  if (lessonsDone >= lessonCount && days >= 20) return 3;
  if (lessonsDone >= Math.ceil(lessonCount / 2) || days >= 10) return 2;
  return 1;
}

const dayHash = (day: string) => [...day].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);

/** Today's challenge: the same all day, a different one most days, from her level (and the level below). */
export function dailyChallenge(day: string, level: ChallengeLevel): Challenge {
  const pool = CHALLENGES.filter((c) => c.level === level || c.level === level - 1);
  return pool[dayHash(day) % pool.length];
}

/** Done = a result of that kind today that reaches the goal. */
export function challengeDone(c: Challenge, results: Result[], day: string): boolean {
  return results.some((r) => r.date === day && r.type === c.type && r.value >= c.goal);
}
