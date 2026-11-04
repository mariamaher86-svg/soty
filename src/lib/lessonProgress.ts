// Studying the lessons: which sections were read, where she left off, how a long lesson is split across days in the
// beginner path, and a quiz drawn from a bigger pool so a retake differs. Pure logic.

export interface SectionLike {
  blocks: object[];
}

export interface LessonLike {
  id: string;
  sections: SectionLike[];
}

/** per lesson: sections read, and the one she was on */
export type LessonProgress = Record<string, { read: number[]; last: number }>;

export function markRead(p: LessonProgress, lesson: string, section: number): LessonProgress {
  const cur = p[lesson] ?? { read: [], last: 0 };
  return { ...p, [lesson]: { read: cur.read.includes(section) ? cur.read : [...cur.read, section].sort((a, b) => a - b), last: section } };
}

export function setLast(p: LessonProgress, lesson: string, section: number): LessonProgress {
  const cur = p[lesson] ?? { read: [], last: 0 };
  return { ...p, [lesson]: { ...cur, last: section } };
}

export const isRead = (p: LessonProgress, lesson: string, section: number) => !!p[lesson]?.read.includes(section);
export const readCount = (p: LessonProgress, lesson: string) => p[lesson]?.read.length ?? 0;

/** Where "ارجعي لآخر مكان" goes: the section she was on, kept inside the lesson. Null = not started. */
export function resumeSection(p: LessonProgress, lesson: LessonLike): number | null {
  const cur = p[lesson.id];
  if (!cur) return null;
  return Math.max(0, Math.min(lesson.sections.length - 1, cur.last));
}

export const firstUnread = (p: LessonProgress, lesson: LessonLike): number => {
  for (let i = 0; i < lesson.sections.length; i++) if (!isRead(p, lesson.id, i)) return i;
  return lesson.sections.length;
};

// ---- splitting a long lesson across days

const WORDS_PER_SECOND = 2.2; // slowly, for someone new to all this
const SECONDS_PER_EXERCISE = 15; // a listen button, or trying with her voice
/** Today's step in the beginner path: about 3 minutes of reading. */
export const DAILY_READING_SECONDS = 180;

/** About how long a section takes: its words, plus time for its sound and voice steps. */
export function sectionSeconds(section: SectionLike): number {
  let words = 0;
  let exercises = 0;
  for (const b of section.blocks) {
    const text = (b as { p?: string; ex?: string; like?: string; note?: string });
    const t = text.p ?? text.ex ?? text.like ?? text.note;
    if (t) words += t.split(/\s+/).length;
    else exercises++;
  }
  return words / WORDS_PER_SECOND + exercises * SECONDS_PER_EXERCISE;
}

export interface Reading {
  lesson: string;
  /** sections from..to (inclusive) to read today; none when only the quiz is left */
  from: number;
  to: number;
  quiz: boolean;
}

/**
 * The beginner path's lesson step. Still one lesson's worth a day: nothing if a lesson was passed today or today's part
 * was already read. Otherwise the first lesson not passed: the next ~3 minutes from where she stopped, and when every
 * section has been read, its quiz.
 */
export function todaysReading(lessons: LessonLike[], done: Record<string, string>, p: LessonProgress, dayRead: string | null, today: string, budget = DAILY_READING_SECONDS): Reading | null {
  if (Object.values(done).includes(today) || dayRead === today) return null;
  const lesson = lessons.find((l) => !done[l.id]);
  if (!lesson) return null;
  const from = firstUnread(p, lesson);
  if (from >= lesson.sections.length) return { lesson: lesson.id, from, to: from - 1, quiz: true };
  let to = from;
  let total = sectionSeconds(lesson.sections[from]);
  while (to + 1 < lesson.sections.length && !isRead(p, lesson.id, to + 1) && total + sectionSeconds(lesson.sections[to + 1]) <= budget) {
    to++;
    total += sectionSeconds(lesson.sections[to]);
  }
  return { lesson: lesson.id, from, to, quiz: false };
}

// ---- quiz drawn from a pool

export interface PoolQuestion {
  q: string;
  options: string[];
  /** the right option's index */
  answer: number;
  /** shown after answering */
  why: string;
}

/** Tiny seeded random, so a draw can be tested. */
function random(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

function shuffled<T>(list: T[], next: () => number): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const QUIZ_SIZE = 10;

/** `count` different questions from the pool, in a new order, with their options shuffled too. */
export function drawQuiz<T extends PoolQuestion>(pool: T[], seed: number, count = QUIZ_SIZE): T[] {
  const next = random(seed * 2654435761 + 1);
  return shuffled(pool, next)
    .slice(0, count)
    .map((q) => {
      const order = shuffled(q.options.map((_, i) => i), next);
      return { ...q, options: order.map((i) => q.options[i]), answer: order.indexOf(q.answer) };
    });
}
