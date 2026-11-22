import { describe, expect, it } from 'vitest';
import { addExamRecord, drawExam, lessonsToRevise, MAX_EXAM_HISTORY, parseExamHistory, scoreByLesson, type ExamRecord } from './exam';
import { LESSONS } from '../content/lessons';

const ids = ['note', 'solfege', 'octave'];

describe('comprehensive exam', () => {
  it('draws only from completed lessons, with no question twice', () => {
    for (let seed = 1; seed < 30; seed++) {
      const e = drawExam(LESSONS, ids, 20, seed);
      expect(e).toHaveLength(20);
      expect(e.every((q) => ids.includes(q.lesson))).toBe(true);
      const keys = e.map((q) => q.lesson + '|' + q.q + '|' + JSON.stringify(q.sound ?? ''));
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('is balanced across the lessons (within one question)', () => {
    for (const size of [10, 20, 30]) {
      const e = drawExam(LESSONS, ids, size, 5);
      const counts = ids.map((id) => e.filter((q) => q.lesson === id).length);
      expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    }
  });

  it('every answer still points at the right option after shuffling', () => {
    const e = drawExam(LESSONS, LESSONS.map((l) => l.id), 30, 9);
    for (const q of e) {
      const src = LESSONS.find((l) => l.id === q.lesson)!.pool.find((p) => p.q === q.q && p.why === q.why)!;
      expect(q.options[q.answer]).toBe(src.options[src.answer]);
    }
  });

  it('never asks more than the completed lessons hold, and nothing if none is completed', () => {
    expect(drawExam(LESSONS, ['note'], 30, 1)).toHaveLength(LESSONS[0].pool.length);
    expect(drawExam(LESSONS, [], 10, 1)).toHaveLength(0);
  });

  it('a new seed gives a different exam', () => {
    const a = drawExam(LESSONS, ids, 10, 1).map((q) => q.q);
    const b = drawExam(LESSONS, ids, 10, 2).map((q) => q.q);
    expect(a).not.toEqual(b);
  });

  it('scores per lesson and lists the weak ones to revise, weakest first', () => {
    const e = drawExam(LESSONS, ids, 9, 3);
    const answers = e.map((q) => (q.lesson === 'octave' ? (q.answer + 1) % q.options.length : q.lesson === 'solfege' && e.filter((x) => x.lesson === 'solfege').indexOf(q) === 0 ? (q.answer + 1) % q.options.length : q.answer));
    const per = scoreByLesson(e, answers);
    expect(per.note).toEqual({ right: 3, total: 3 });
    expect(per.solfege).toEqual({ right: 2, total: 3 });
    expect(per.octave).toEqual({ right: 0, total: 3 });
    expect(lessonsToRevise(per)).toEqual(['octave', 'solfege']);
  });

  it('history keeps the last 50 and survives bad data', () => {
    let h: ExamRecord[] = [];
    for (let i = 0; i < 60; i++) h = addExamRecord(h, { date: '2026-11-22', ts: i, right: i % 10, total: 10, lessons: {} });
    expect(h).toHaveLength(MAX_EXAM_HISTORY);
    expect(h[0].ts).toBe(10);
    expect(parseExamHistory('nope')).toEqual([]);
    expect(parseExamHistory(JSON.stringify([{ right: 1, total: 2 }, { bad: true }]))).toHaveLength(1);
  });
});
