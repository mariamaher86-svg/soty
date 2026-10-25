// "إزاي أجيب دو صح؟": a guided note-finding ladder for someone who can't match pitch yet.
// Hear the note → hum softly → slide until the dot sits on the line → hold 1 s → next note (do re mi fa sol, then back down).

import { wrapOctave } from './music';

export const LADDER_TOLERANCE = 35;
/** do re mi fa sol and back down (semitones above "do") */
export const LADDER_DEGREES = [0, 2, 4, 5, 7, 5, 4, 2, 0];
export const LADDER_NAMES = ['دو', 'ري', 'مي', 'فا', 'صول', 'فا', 'مي', 'ري', 'دو'];

export function ladderNotes(doMidi: number): number[] {
  return LADDER_DEGREES.map((d) => doMidi + d);
}

/**
 * Cents to show on the ladder. A beginner often lands an octave away; that still counts as finding the note
 * (folded into the target's octave), and `octave` says it happened.
 */
export function ladderCents(rawCents: number): { cents: number; octave: boolean } {
  const folded = wrapOctave(rawCents);
  return { cents: folded, octave: Math.abs(rawCents - folded) >= 600 };
}

export type LadderGuide = 'none' | 'ok' | 'up' | 'down';

export function ladderGuide(cents: number | null, tol = LADDER_TOLERANCE): LadderGuide {
  if (cents === null) return 'none';
  if (Math.abs(cents) <= tol) return 'ok';
  return cents < 0 ? 'up' : 'down';
}

/** Vertical position on the ladder, 0 (bottom) .. 1 (top), for a voice `cents` away from the target in the middle. */
export function dotPosition(cents: number, spanCents = 400): number {
  return Math.max(0, Math.min(1, 0.5 + cents / (2 * spanCents)));
}

/** A gentle tip after struggling for a while (null = no tip yet). */
export function ladderTip(secondsTrying: number, recentCents: number[]): string | null {
  if (secondsTrying < 10) return null;
  if (!recentCents.length) return 'مسمعناش صوت: همهمي "مممم" بصوت أعلى شوية وقرّبي من الموبايل.';
  const avg = recentCents.reduce((a, b) => a + b, 0) / recentCents.length;
  if (Math.abs(avg) > 250) return 'إنتي لسه بعيدة: ابدئي بصوت هادي ومريح، واطلعي أو انزلي ببطء شديد زي زحلقة لحد ما النقطة تيجي على الخط.';
  if (avg < -LADDER_TOLERANCE) return 'إنتي أوطى شوية: همهمي أعلى سنة صغيرة، كأنك بتسألي "مم؟".';
  if (avg > LADDER_TOLERANCE) return 'إنتي أعلى شوية: همهمي أوطى سنة صغيرة، وبصوت أهدى.';
  return 'قربتي جدًا! اثبتي على الصوت ثانية من غير ما تتحركي.';
}
