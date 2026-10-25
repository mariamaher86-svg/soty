import { describe, expect, it } from 'vitest';
import { LESSONS, quizPassed, scoreQuiz, soundFreqs, soundOffsets, todaysLesson } from './lessons';
import { workoutPlan } from '../lib/path';
import { centsBetween, midiToFreq } from '../lib/music';

describe('lessons content', () => {
  it('10 lessons in learning order, each 1–3 screens and a 3–5 question quiz with valid answers', () => {
    expect(LESSONS.map((l) => l.id)).toEqual(['note', 'solfege', 'octave', 'tone', 'scale', 'quarter', 'maqam', 'cents', 'tune', 'rhythm']);
    for (const l of LESSONS) {
      expect(l.screens.length).toBeGreaterThanOrEqual(1);
      expect(l.screens.length).toBeLessThanOrEqual(3);
      expect(l.quiz.length).toBeGreaterThanOrEqual(3);
      expect(l.quiz.length).toBeLessThanOrEqual(5);
      for (const q of l.quiz) expect(q.answer).toBeLessThan(q.options.length);
      for (const s of l.screens) for (const e of s.examples) expect(soundOffsets(e.sound).length || e.sound.clicks?.beats.length).toBeGreaterThan(0);
    }
  });
  it('the quarter-tone example plays E, E half-flat and E-flat exactly', () => {
    const q = LESSONS.find((l) => l.id === 'quarter')!;
    const freqs = soundFreqs(q.screens[0].examples[0].sound, 60);
    expect(freqs.map((f) => Math.round(centsBetween(f, midiToFreq(60))))).toEqual([400, 350, 300]);
    const rast = soundFreqs(q.screens[1].examples[1].sound, 60);
    expect(Math.round(centsBetween(rast[2], midiToFreq(60)))).toBe(350);
  });
  it('maqam examples come from the maqam table (Rast has its quarter tones)', () => {
    expect(soundOffsets({ maqam: 'rast' })).toEqual([0, 2, 3.5, 5, 7, 9, 10.5, 12]);
  });
});

describe('quiz', () => {
  const quiz = LESSONS[0].quiz;
  it('scores right answers and passes with 4 of 5', () => {
    const all = quiz.map((q) => q.answer);
    expect(scoreQuiz(quiz, all)).toBe(5);
    const four = [...all];
    four[0] = (four[0] + 1) % quiz[0].options.length;
    expect(scoreQuiz(quiz, four)).toBe(4);
    expect(quizPassed(4, 5)).toBe(true);
    expect(quizPassed(3, 5)).toBe(false);
    expect(scoreQuiz(quiz, [null, null])).toBe(0);
    expect(quizPassed(0, 0)).toBe(false);
  });
});

describe('beginner path: one lesson a day', () => {
  it('first lesson not passed yet; none once one was passed today; none when all are done', () => {
    expect(todaysLesson({}, '2026-10-20')).toBe('note');
    expect(todaysLesson({ note: '2026-10-19' }, '2026-10-20')).toBe('solfege');
    expect(todaysLesson({ note: '2026-10-20' }, '2026-10-20')).toBeNull();
    expect(todaysLesson({ note: '2026-10-19', octave: '2026-10-18' }, '2026-10-20')).toBe('solfege'); // in order, gaps first
    const all = Object.fromEntries(LESSONS.map((l) => [l.id, '2026-10-01']));
    expect(todaysLesson(all, '2026-10-20')).toBeNull();
  });
  it('the lesson is the first workout step, and interval singing waits until the basics are done', () => {
    const p = workoutPlan(false, true);
    expect(p[0].step).toBe('lesson');
    expect(p.some((s) => s.step === 'intervals')).toBe(false);
    expect(p.reduce((a, s) => a + s.minutes, 0)).toBeLessThanOrEqual(14);
    expect(workoutPlan(true, true)[0].step).toBe('lesson');
    expect(workoutPlan(false, false)[0].step).toBe('warmup');
  });
});
