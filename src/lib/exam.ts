// "امتحان شامل": random questions from the lessons she has completed, balanced across them, scored per lesson so
// she knows which one to revise. Pure logic (the page is in LessonsPage).

import { drawQuiz, seededShuffle, type PoolQuestion } from './lessonProgress';

export interface ExamLesson<Q extends PoolQuestion = PoolQuestion> {
  id: string;
  pool: Q[];
}

export type ExamItem<Q extends PoolQuestion = PoolQuestion> = Q & { lesson: string };

export const EXAM_SIZES = [10, 20, 30] as const;

/** Pass mark per lesson inside the exam: below this, "راجعي الدرس ده". */
export const REVISE_BELOW = 0.8;

/**
 * `size` different questions from the completed lessons only, taken in turns (so each lesson gets about the same
 * number), in a random order, with their options shuffled. Never more than the completed pools hold.
 */
export function drawExam<Q extends PoolQuestion>(lessons: ExamLesson<Q>[], completed: string[], size: number, seed: number): ExamItem<Q>[] {
  const done = lessons.filter((l) => completed.includes(l.id));
  // each lesson's pool in its own random order (options shuffled too)
  const decks = done.map((l, i) => ({ id: l.id, qs: drawQuiz(l.pool, seed * 31 + i + 1, l.pool.length) }));
  // the order lessons take turns in changes with the seed too
  const order = seededShuffle(decks, seed + 7);
  const out: ExamItem<Q>[] = [];
  for (let round = 0; out.length < size; round++) {
    let added = false;
    for (const d of order) {
      if (out.length >= size) break;
      const q = d.qs[round];
      if (!q) continue;
      out.push({ ...q, lesson: d.id });
      added = true;
    }
    if (!added) break;
  }
  // mix the lessons so questions from one lesson don't come in a block
  return seededShuffle(out, seed + 13);
}

export interface LessonScore {
  right: number;
  total: number;
}

/** Right answers per lesson. */
export function scoreByLesson(items: ExamItem[], answers: (number | null | undefined)[]): Record<string, LessonScore> {
  const out: Record<string, LessonScore> = {};
  items.forEach((q, i) => {
    const s = (out[q.lesson] ??= { right: 0, total: 0 });
    s.total++;
    if (answers[i] === q.answer) s.right++;
  });
  return out;
}

/** The lessons to revise: below the mark, weakest first. */
export function lessonsToRevise(per: Record<string, LessonScore>): string[] {
  return Object.entries(per)
    .filter(([, s]) => s.total > 0 && s.right / s.total < REVISE_BELOW)
    .sort((a, b) => a[1].right / a[1].total - b[1].right / b[1].total)
    .map(([id]) => id);
}

export interface ExamRecord {
  date: string;
  ts: number;
  right: number;
  total: number;
  /** lesson id → [right, total] */
  lessons: Record<string, [number, number]>;
}

export const MAX_EXAM_HISTORY = 50;

/** The new record added, the oldest dropped past the cap. */
export function addExamRecord(history: ExamRecord[], r: ExamRecord): ExamRecord[] {
  return [...history, r].slice(-MAX_EXAM_HISTORY);
}

export function parseExamHistory(raw: string | null): ExamRecord[] {
  try {
    const v = JSON.parse(raw ?? '[]');
    return Array.isArray(v) ? v.filter((x) => x && typeof x.right === 'number' && typeof x.total === 'number') : [];
  } catch {
    return [];
  }
}
