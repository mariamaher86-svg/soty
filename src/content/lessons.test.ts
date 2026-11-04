import { describe, expect, it } from 'vitest';
import { GLOSSARY_TERMS, LESSONS, quizPassed, scoreQuiz, soundOffsets, termByKey, termLinks, todaysLesson } from './lessons';
import { drawQuiz } from '../lib/lessonProgress';
import { buildScale, maqamChart } from '../lib/theory';
import { MAQAMAT } from '../lib/maqam';
import { workoutPlan } from '../lib/path';
import appSource from '../App.tsx?raw';

describe('lessons content', () => {
  it('every lesson has 4–8 sections, a summary and a pool bigger than a quiz, with no duplicate questions', () => {
    expect(LESSONS.length).toBe(14);
    for (const l of LESSONS) {
      expect(l.sections.length).toBeGreaterThanOrEqual(4);
      expect(l.sections.length).toBeLessThanOrEqual(8);
      expect(l.summary.length).toBeGreaterThanOrEqual(2);
      expect(l.pool.length).toBeGreaterThan(10);
      for (const q of l.pool) expect(q.answer).toBeLessThan(q.options.length);
    }
  });
  it('no repeated question, and each question has different options with a reason', () => {
    for (const l of LESSONS) {
      const seen = l.pool.map((q) => q.q + JSON.stringify(q.sound ?? ''));
      expect(new Set(seen).size, l.id).toBe(seen.length);
      for (const q of l.pool) {
        expect(new Set(q.options).size, q.q).toBe(q.options.length);
        expect(q.options.length).toBeGreaterThanOrEqual(2);
        expect(q.why.length).toBeGreaterThan(0);
      }
    }
  });
  it('old lesson ids stay, so progress stays valid', () => {
    for (const id of ['note', 'solfege', 'octave', 'tone', 'scale', 'quarter', 'maqam', 'cents', 'tune', 'rhythm']) expect(LESSONS.some((l) => l.id === id), id).toBe(true);
  });
  it('every link in a lesson goes to a real page; every example has something to play', () => {
    const pages = new Set([...appSource.matchAll(/\{ id: '([a-z]+)'/g)].map((m) => m[1]));
    for (const l of LESSONS)
      for (const s of l.sections)
        for (const b of s.blocks) {
          if ('links' in b) for (const x of b.links) expect(pages.has(x.href.replace('#/', '')), x.href).toBe(true);
          if ('listen' in b) for (const e of b.listen) expect(soundOffsets(e.sound).length || e.sound.clicks?.beats.length, e.label).toBeGreaterThan(0);
          if ('maqam' in b) expect(() => maqamChart(b.maqam)).not.toThrow();
        }
  });
  it('every required maqam has its own chart', () => {
    const charted = LESSONS.flatMap((l) => l.sections.flatMap((s) => s.blocks.flatMap((b) => ('maqam' in b ? [b.maqam] : []))));
    expect(charted.sort()).toEqual(['ajam', 'bayati', 'hijaz', 'kurd', 'nahawand', 'rast', 'saba']);
  });
  it('glossary links resolve', () => {
    expect(new Set(GLOSSARY_TERMS.map((t) => t.key)).size).toBe(GLOSSARY_TERMS.length);
    for (const l of LESSONS)
      for (const s of l.sections)
        for (const b of s.blocks) for (const k of termLinks(JSON.stringify(b))) expect(termByKey(k), k).toBeTruthy();
  });
  it('scales and maqamat agree with the table', () => {
    expect(buildScale('major', 'C').notes.map((n) => n.name).join(' ')).toBe('C D E F G A B C');
    expect(buildScale('major', 'G').notes.map((n) => n.name).join(' ')).toBe('G A B C D E F♯ G');
    expect(buildScale('minor', 'A').notes.map((n) => n.name).join(' ')).toBe('A B C D E F G A');
    expect(buildScale('harmonic', 'A').notes[6].name).toBe('G♯');
    for (const m of MAQAMAT.filter((x) => ['ajam', 'nahawand', 'kurd', 'rast', 'bayati', 'hijaz', 'saba'].includes(x.id))) expect(maqamChart(m.id).up.map((n) => n.cents)).toEqual(m.up);
    expect(soundOffsets({ maqam: 'rast' })).toEqual([0, 2, 3.5, 5, 7, 9, 10.5, 12]);
  });
});

describe('quiz', () => {
  it('draws 10, keeps answers valid, and a retake differs; pass is 8 of 10', () => {
    const a = drawQuiz(LESSONS[0].pool, 1);
    const b = drawQuiz(LESSONS[0].pool, 2);
    expect(a.length).toBe(10);
    expect(scoreQuiz(a, a.map((q) => q.answer))).toBe(10);
    for (const q of a) expect(q.options[q.answer]).toBe(LESSONS[0].pool.find((x) => x.q === q.q && x.why === q.why)!.options[0]);
    expect(a.map((q) => q.why).join()).not.toBe(b.map((q) => q.why).join());
    expect(quizPassed(8, 10)).toBe(true);
    expect(quizPassed(7, 10)).toBe(false);
    expect(quizPassed(0, 0)).toBe(false);
  });
});

describe('beginner path: one lesson a day', () => {
  it('first lesson not passed yet; none once one was passed today; none when all are done', () => {
    expect(todaysLesson({}, '2026-10-20')).toBe('note');
    expect(todaysLesson({ note: '2026-10-19' }, '2026-10-20')).toBe('solfege');
    expect(todaysLesson({ note: '2026-10-20' }, '2026-10-20')).toBeNull();
    const all = Object.fromEntries(LESSONS.map((l) => [l.id, '2026-10-01']));
    expect(todaysLesson(all, '2026-10-20')).toBeNull();
  });
  it('the lesson is the first workout step', () => {
    expect(workoutPlan(false, true)[0].step).toBe('lesson');
    expect(workoutPlan(false, false)[0].step).toBe('warmup');
  });
});
