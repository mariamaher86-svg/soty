import { describe, expect, it } from 'vitest';
import { canAnswer, canReplay, initialQ, qReducer, type QEvent, type QState } from './questionFlow';
import { settleWithin } from '../audio/audio';

const run = (events: QEvent[], s: QState = initialQ) => events.reduce(qReducer, s);

describe('question flow (ear training / quizzes)', () => {
  it('answers are allowed while the sound is still playing — a sound that never ends cannot lock them', () => {
    const s = run([{ type: 'next' }]); // "played" never arrives (paused audio on iOS)
    expect(s.phase).toBe('playing');
    expect(canAnswer(s)).toBe(true);
    expect(canReplay(s)).toBe(true);
  });
  it('one answer per question, counted once; next question unlocks again', () => {
    let s = run([{ type: 'next' }, { type: 'played' }, { type: 'answer', value: 'a', correct: true }]);
    expect(s).toMatchObject({ phase: 'answered', chosen: 'a', right: 1, total: 1 });
    s = qReducer(s, { type: 'answer', value: 'b', correct: true }); // double tap
    expect(s.total).toBe(1);
    expect(canAnswer(s)).toBe(false);
    s = run([{ type: 'next' }], s);
    expect(canAnswer(s)).toBe(true);
    expect(s.chosen).toBeNull();
    expect(s.total).toBe(1); // the score carries on
  });
  it('a late "played" from the previous question or a replay after answering never reopens answers', () => {
    let s = run([{ type: 'next' }, { type: 'answer', value: 'a', correct: false }, { type: 'played' }]);
    expect(s.phase).toBe('answered');
    s = qReducer(s, { type: 'replay' });
    expect(s.phase).toBe('answered');
    expect(canReplay(s)).toBe(true);
  });
  it('reset goes back to the start (changing level / leaving the page)', () => {
    expect(run([{ type: 'next' }, { type: 'answer', value: 'a', correct: true }, { type: 'reset' }])).toEqual(initialQ);
  });
});

describe('sounds always settle', () => {
  it('resolves when the sound ends, or after the limit if it never does', async () => {
    expect(await settleWithin(Promise.resolve('done'), 50)).toBe('done');
    const never = new Promise<string>(() => {});
    const t0 = Date.now();
    expect(await settleWithin(never, 60)).toBeUndefined();
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(await settleWithin(Promise.reject(new Error('x')), 50)).toBeUndefined();
  });
});
