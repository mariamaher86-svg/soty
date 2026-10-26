// "🎹 فوكاليز على البيانو": a vocalise (or a maqam scale) from a key she picks; she sings it back and each note is
// followed and judged one by one (hold → ✔, too long → ✘ and move on), then the round is scored and the pattern
// can climb a semitone at a time inside her range and come back down.

import type { Maqam } from './maqam';
import { VOCALISES, type Vocalise } from './vocalise';

export const STEP_TOLERANCE = 25; // cents
export const HOLD_MS = 400;
export const STACCATO_HOLD_MS = 200;
export const STEP_TIMEOUT_MS = 4000; // can't get it → ✘, next note
export const GAP_MS = 120; // short dropouts forgiven while holding
export const GOOD_ROUND = 80; // % for auto-climb
/** readings this close to the target count for "how far off" on a missed note (further = searching, not singing it) */
const NEAR_CENTS = 150;

export type PatternSource = { kind: 'vocalise'; id: string } | { kind: 'maqam'; maqam: Maqam };

export interface Step {
  /** target pitch, MIDI; .5 = quarter tone */
  midi: number;
  syllable: string;
  /** seconds when played as a reference (before tempo) */
  dur: number;
  staccato: boolean;
  /** reached by a glide (octave slide): off-pitch readings on the way are ignored, it gets a bit more time */
  afterGlide: boolean;
}

export const TEMPOS = [
  { id: 'slow', ar: 'بطيء', factor: 1.5 },
  { id: 'medium', ar: 'متوسط', factor: 1 },
  { id: 'fast', ar: 'سريع', factor: 0.7 },
] as const;
export type TempoId = (typeof TEMPOS)[number]['id'];

export const vocaliseById = (id: string): Vocalise | undefined => VOCALISES.find((v) => v.id === id);

/** The notes to sing from `start`: a vocalise pattern, or a maqam scale up its octave and back down (quarter tones kept). */
export function patternSteps(src: PatternSource, start: number): Step[] {
  if (src.kind === 'maqam') {
    const up = src.maqam.up.map((c) => c / 100);
    const down = (src.maqam.down ?? src.maqam.up).map((c) => c / 100).reverse();
    return [...up, ...down.slice(1)].map((d) => ({ midi: start + d, syllable: 'آه', dur: 0.6, staccato: false, afterGlide: false }));
  }
  const v = vocaliseById(src.id)!;
  const glide = v.id === 'octave';
  return v.degrees.map((d, i) => ({ midi: start + d, syllable: v.syllables[i] ?? v.syllables[0], dur: v.dur, staccato: !!v.gap, afterGlide: glide && i > 0 }));
}

/** Highest semitone above the start note in the pattern. */
export const patternTop = (steps: Step[], start: number) => Math.max(...steps.map((s) => s.midi)) - start;

export const holdMsFor = (s: Step) => (s.staccato ? STACCATO_HOLD_MS : HOLD_MS);
export const timeoutMsFor = (s: Step) => STEP_TIMEOUT_MS + (s.afterGlide ? 1500 : 0);

export interface StepResult {
  ok: boolean;
  /** how far off (median of the near readings), null = nothing near was sung */
  cents: number | null;
}

export interface FollowState {
  index: number; // current step
  heldMs: number;
  gapMs: number;
  elapsedMs: number;
  near: number[]; // cents readings close to the current target
  results: StepResult[];
  done: boolean;
}

export const startFollow = (): FollowState => ({ index: 0, heldMs: 0, gapMs: 0, elapsedMs: 0, near: [], results: [], done: false });

const medianOf = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * One mic reading: `cents` = how far she is from the current target (null = silence / no pitch).
 * Held within ±25 c for the step's hold time → ✔; no ✔ before the timeout → ✘ (with how far off), and on to the next.
 * An octave off is not accepted (the page shows the octave hint instead).
 */
export function followStep(st: FollowState, steps: Step[], cents: number | null, dtMs: number): FollowState {
  if (st.done) return st;
  const step = steps[st.index];
  const s: FollowState = { ...st, elapsedMs: st.elapsedMs + dtMs, near: st.near };
  if (cents !== null && Math.abs(cents) <= NEAR_CENTS) s.near = [...st.near, cents];
  if (cents !== null && Math.abs(cents) <= STEP_TOLERANCE) {
    s.heldMs = st.heldMs + dtMs;
    s.gapMs = 0;
  } else {
    s.gapMs = st.gapMs + dtMs;
    if (s.gapMs > GAP_MS) s.heldMs = 0;
  }
  const ok = s.heldMs >= holdMsFor(step);
  if (!ok && s.elapsedMs < timeoutMsFor(step)) return s;
  const result: StepResult = { ok, cents: s.near.length ? Math.round(medianOf(ok ? s.near.filter((c) => Math.abs(c) <= STEP_TOLERANCE) : s.near)) : null };
  const results = [...st.results, result];
  const index = st.index + 1;
  return { index, heldMs: 0, gapMs: 0, elapsedMs: 0, near: [], results, done: index >= steps.length };
}

export interface RoundScore {
  ok: number;
  total: number;
  percent: number;
  /** the notes that were off: step index and cents (null = not heard) */
  off: { index: number; cents: number | null }[];
}

export function roundScore(results: StepResult[]): RoundScore {
  const ok = results.filter((r) => r.ok).length;
  return {
    ok,
    total: results.length,
    percent: results.length ? Math.round((ok / results.length) * 100) : 0,
    off: results.map((r, index) => ({ index, cents: r.cents, ok: r.ok })).filter((r) => !r.ok).map(({ index, cents }) => ({ index, cents })),
  };
}

/** "أعلى ٣٠ سنت" / "أوطى ١٥ سنت" / "مسمعناش". */
export function offWords(cents: number | null): string {
  if (cents === null) return 'مسمعناش';
  const n = String(Math.abs(cents)).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);
  return cents > 0 ? `أعلى ${n} سنت` : cents < 0 ? `أوطى ${n} سنت` : 'مظبوط';
}

export type ClimbDir = 'up' | 'down';

/**
 * Auto-climb: after a good round go up a semitone while the pattern's top stays in her range; at the top turn
 * around and come down to her lowest start; then it's finished. A weaker round repeats the same key.
 */
export function nextClimb(start: number, top: number, low: number, high: number, dir: ClimbDir, percent: number): { start: number; dir: ClimbDir; finished: boolean } {
  if (percent < GOOD_ROUND) return { start, dir, finished: false };
  if (dir === 'up') {
    if (start + 1 + top <= high) return { start: start + 1, dir: 'up', finished: false };
    if (start - 1 >= low) return { start: start - 1, dir: 'down', finished: false };
    return { start, dir: 'down', finished: true };
  }
  if (start - 1 >= low) return { start: start - 1, dir: 'down', finished: false };
  return { start, dir: 'down', finished: true };
}

/** Default start: the bottom of her comfortable range (auto-climb then takes it up as far as the pattern fits). */
export function defaultStart(low: number): number {
  return Math.round(low);
}
