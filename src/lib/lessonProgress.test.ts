import { describe, expect, it } from 'vitest';
import { DAILY_READING_SECONDS, drawQuiz, firstUnread, isRead, markRead, readCount, resumeSection, sectionSeconds, setLast, todaysReading, type LessonLike, type LessonProgress } from './lessonProgress';

const words = (n: number) => ({ p: Array(n).fill('كلمة').join(' ') });
const lesson = (id: string, sizes: number[]): LessonLike => ({ id, sections: sizes.map((n) => ({ blocks: [words(n)] })) });

describe('reading progress', () => {
  it('marks sections, remembers the place, and survives a shrunken lesson', () => {
    let p: LessonProgress = {};
    const l = lesson('a', [10, 10, 10]);
    expect(resumeSection(p, l)).toBeNull();
    p = markRead(p, 'a', 1);
    p = markRead(p, 'a', 0);
    p = markRead(p, 'a', 1);
    expect(p.a.read).toEqual([0, 1]);
    expect(readCount(p, 'a')).toBe(2);
    expect(isRead(p, 'a', 2)).toBe(false);
    expect(firstUnread(p, l)).toBe(2);
    p = setLast(p, 'a', 2);
    expect(resumeSection(p, l)).toBe(2);
    expect(resumeSection(setLast(p, 'a', 99), l)).toBe(2);
  });
  it('counts listening and voice steps in the reading time', () => {
    expect(sectionSeconds({ blocks: [{ listen: [] }, { voice: {} }] })).toBe(30);
    expect(sectionSeconds({ blocks: [words(22)] })).toBeCloseTo(10);
  });
});

describe("the path's daily part", () => {
  const big = Math.round((DAILY_READING_SECONDS / 2) * 2.2) - 1; // two of these fit in a day, three don't
  const lessons = [lesson('a', [big, big, big, big, big]), lesson('b', [10])];
  const today = '2026-11-04';

  it('starts at the beginning with about 3 minutes', () => {
    expect(todaysReading(lessons, {}, {}, null, today)).toEqual({ lesson: 'a', from: 0, to: 1, quiz: false });
  });
  it('continues where she stopped on another day', () => {
    let p: LessonProgress = {};
    p = markRead(markRead(p, 'a', 0), 'a', 1);
    expect(todaysReading(lessons, {}, p, '2026-11-03', today)).toEqual({ lesson: 'a', from: 2, to: 3, quiz: false });
  });
  it('nothing more once today is read or a lesson was passed today', () => {
    expect(todaysReading(lessons, {}, {}, today, today)).toBeNull();
    expect(todaysReading(lessons, { b: today }, {}, null, today)).toBeNull();
  });
  it('a section longer than the budget is still one day', () => {
    expect(todaysReading([lesson('x', [5000, 10])], {}, {}, null, today)).toEqual({ lesson: 'x', from: 0, to: 0, quiz: false });
  });
  it('the quiz comes when every section is read, then the next lesson', () => {
    let p: LessonProgress = {};
    for (let i = 0; i < 5; i++) p = markRead(p, 'a', i);
    expect(todaysReading(lessons, {}, p, '2026-11-03', today)).toMatchObject({ lesson: 'a', quiz: true });
    expect(todaysReading(lessons, { a: '2026-11-03' }, p, '2026-11-03', today)).toMatchObject({ lesson: 'b', from: 0 });
  });
  it('sections read out of order are not read again', () => {
    const p = markRead({}, 'a', 1);
    expect(todaysReading(lessons, {}, p, null, today)).toEqual({ lesson: 'a', from: 0, to: 0, quiz: false });
  });
});

describe('quiz draw', () => {
  const pool = Array.from({ length: 13 }, (_, i) => ({ q: `q${i}`, options: ['right', 'x', 'y'], answer: 0, why: '' }));
  it('gives different questions, in a new order, with the answer still pointing at the right option', () => {
    const a = drawQuiz(pool, 5);
    expect(a.length).toBe(10);
    expect(new Set(a.map((x) => x.q)).size).toBe(10);
    for (const x of a) expect(x.options[x.answer]).toBe('right');
  });
  it('a retake differs, and the same seed repeats', () => {
    expect(drawQuiz(pool, 5).map((x) => x.q)).not.toEqual(drawQuiz(pool, 6).map((x) => x.q));
    expect(drawQuiz(pool, 5)).toEqual(drawQuiz(pool, 5));
  });
});
