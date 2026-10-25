// One listening question at a time (ear training, lesson quizzes): what may be pressed when.
// Answering is allowed while the sound is still playing, and replay is always allowed — so a sound that
// never finishes (paused audio on iOS) can never lock the buttons.

export type QPhase = 'idle' | 'playing' | 'waiting' | 'answered';

export interface QState {
  phase: QPhase;
  chosen: string | null;
  right: number;
  total: number;
}

export type QEvent =
  | { type: 'next' } // a new question starts playing
  | { type: 'played' } // its sound finished (or timed out)
  | { type: 'replay' }
  | { type: 'answer'; value: string; correct: boolean }
  | { type: 'reset' };

export const initialQ: QState = { phase: 'idle', chosen: null, right: 0, total: 0 };

export function qReducer(s: QState, e: QEvent): QState {
  switch (e.type) {
    case 'next':
      return { ...s, phase: 'playing', chosen: null };
    case 'played':
      return s.phase === 'playing' ? { ...s, phase: 'waiting' } : s;
    case 'replay':
      return s.phase === 'waiting' ? { ...s, phase: 'playing' } : s; // after answering, replay doesn't reopen answers
    case 'answer':
      if (!canAnswer(s)) return s;
      return { ...s, phase: 'answered', chosen: e.value, right: s.right + (e.correct ? 1 : 0), total: s.total + 1 };
    case 'reset':
      return initialQ;
  }
}

export const canAnswer = (s: QState) => s.phase === 'playing' || s.phase === 'waiting';
export const canReplay = (s: QState) => s.phase !== 'idle';
