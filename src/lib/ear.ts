// Ear training ("تدريب الودن"): levels, unlock rule and question generators. Listening only.

import { MAQAMAT, chooseTonic } from './maqam';
import { midiToFreq, shiftCents } from './music';

export type EarLevel = 'pitch' | 'same' | 'interval' | 'maqam';

export const EAR_LEVELS: { id: EarLevel; n: number; ar: string; desc: string }[] = [
  { id: 'pitch', n: 1, ar: 'أعلى ولا أوطى', desc: 'نغمتين ورا بعض: التانية أعلى ولا أوطى؟' },
  { id: 'same', n: 2, ar: 'زي بعض ولا لأ', desc: 'نغمتين: هما نفس النغمة ولا فيه فرق صغير؟' },
  { id: 'interval', n: 3, ar: 'المسافات', desc: 'المسافة بين النغمتين اسمها إيه؟' },
  { id: 'maqam', n: 4, ar: 'أنهي مقام', desc: 'اسمعي السلم واختاري المقام.' },
];

/** Answers needed to unlock the next level: 8 right out of the last 10. */
export const PASS_RIGHT = 8;
export const PASS_WINDOW = 10;

export function lastWindow(answers: boolean[]): boolean[] {
  return answers.slice(-PASS_WINDOW);
}

export function rightInWindow(answers: boolean[]): number {
  return lastWindow(answers).filter(Boolean).length;
}

export function levelPassed(answers: boolean[]): boolean {
  return answers.length >= PASS_WINDOW && rightInWindow(answers) >= PASS_RIGHT;
}

/** Level n is open once level n-1 was passed at some point (unlocks are never taken back). Level 1 is always open. */
export function isUnlocked(level: EarLevel, history: Partial<Record<EarLevel, boolean[]>>): boolean {
  const i = EAR_LEVELS.findIndex((l) => l.id === level);
  if (i <= 0) return true;
  const prev = EAR_LEVELS[i - 1].id;
  return isUnlocked(prev, history) && everPassed(history[prev] ?? []);
}

/** True if at any point there were 8 right in some 10 consecutive answers (unlocks are not taken back). */
export function everPassed(answers: boolean[]): boolean {
  for (let end = PASS_WINDOW; end <= answers.length; end++) if (answers.slice(end - PASS_WINDOW, end).filter(Boolean).length >= PASS_RIGHT) return true;
  return false;
}

/** The level to practise now: the first open level not passed yet (or the last one). */
export function currentLevel(history: Partial<Record<EarLevel, boolean[]>>): EarLevel {
  for (const l of EAR_LEVELS) if (!everPassed(history[l.id] ?? [])) return l.id;
  return EAR_LEVELS[EAR_LEVELS.length - 1].id;
}

/** 0 = easiest .. steps-1 = hardest, from how many of the last 10 were right. */
export function difficulty(answers: boolean[], steps: number): number {
  return Math.min(steps - 1, Math.floor((rightInWindow(answers) * steps) / PASS_WINDOW));
}

// ---- question data

export const PITCH_GAPS = [7, 5, 4, 3, 2, 1]; // semitones, big -> small
export const SAME_CENTS = [50, 40, 30, 25, 20, 15, 10];

export const INTERVALS: { semis: number; ar: string; en: string }[] = [
  { semis: 0, ar: 'نفس النغمة', en: 'Unison' },
  { semis: 1, ar: 'تانية صغيرة', en: 'Minor 2nd' },
  { semis: 2, ar: 'تانية كبيرة', en: 'Major 2nd' },
  { semis: 3, ar: 'تالتة صغيرة', en: 'Minor 3rd' },
  { semis: 4, ar: 'تالتة كبيرة', en: 'Major 3rd' },
  { semis: 5, ar: 'رابعة تامة', en: 'Perfect 4th' },
  { semis: 7, ar: 'خامسة تامة', en: 'Perfect 5th' },
  { semis: 12, ar: 'أوكتاف', en: 'Octave' },
];
/** Interval sets that grow with difficulty. */
export const INTERVAL_STAGES = [
  [0, 7, 12],
  [0, 3, 4, 5, 7, 12],
  [0, 1, 2, 3, 4, 5, 7, 12],
];
/** Maqam choices that grow: 2 easy ones first, then 3–4 including quarter-tone maqamat. */
export const MAQAM_STAGES = [
  { pool: ['ajam', 'nahawand'], choices: 2 },
  { pool: ['ajam', 'nahawand', 'rast', 'bayati'], choices: 3 },
  { pool: ['ajam', 'nahawand', 'rast', 'bayati', 'hijaz', 'saba'], choices: 4 },
];

export type Question =
  | { kind: 'pitch'; notes: [number, number]; answer: 'higher' | 'lower'; gap: number }
  | { kind: 'same'; notes: [number, number]; answer: 'same' | 'different'; cents: number }
  | { kind: 'interval'; notes: [number, number]; answer: number; choices: number[] }
  | { kind: 'maqam'; tonic: number; answer: string; choices: string[] };

type Rng = () => number;
const pick = <T,>(xs: T[], rng: Rng): T => xs[Math.floor(rng() * xs.length)];
const randInt = (lo: number, hi: number, rng: Rng) => lo + Math.floor(rng() * (hi - lo + 1));
function shuffle<T>(xs: T[], rng: Rng): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * A question for a level, with notes inside [low, high] (MIDI). `answers` = her history on this level
 * (more right answers -> harder questions).
 */
export function makeQuestion(level: EarLevel, answers: boolean[], low: number, high: number, rng: Rng = Math.random): Question {
  const span = Math.max(1, high - low);
  if (level === 'pitch') {
    const gap = Math.min(PITCH_GAPS[difficulty(answers, PITCH_GAPS.length)], span);
    const a = randInt(low, high - gap, rng);
    const up = rng() < 0.5;
    const [n1, n2] = up ? [a, a + gap] : [a + gap, a];
    return { kind: 'pitch', notes: [midiToFreq(n1), midiToFreq(n2)], answer: up ? 'higher' : 'lower', gap };
  }
  if (level === 'same') {
    const cents = SAME_CENTS[difficulty(answers, SAME_CENTS.length)];
    const base = midiToFreq(randInt(low + 1, high - 1, rng));
    if (rng() < 0.4) return { kind: 'same', notes: [base, base], answer: 'same', cents: 0 };
    const signed = rng() < 0.5 ? cents : -cents;
    return { kind: 'same', notes: [base, shiftCents(base, signed)], answer: 'different', cents: signed };
  }
  if (level === 'interval') {
    const stage = INTERVAL_STAGES[difficulty(answers, INTERVAL_STAGES.length)];
    const choices = stage.filter((s) => s <= span);
    const semis = pick(choices, rng);
    const a = randInt(low, high - semis, rng);
    return { kind: 'interval', notes: [midiToFreq(a), midiToFreq(a + semis)], answer: semis, choices };
  }
  const stage = MAQAM_STAGES[difficulty(answers, MAQAM_STAGES.length)];
  const answer = pick(stage.pool, rng);
  const others = shuffle(
    stage.pool.filter((id) => id !== answer),
    rng,
  ).slice(0, stage.choices - 1);
  return { kind: 'maqam', tonic: chooseTonic(low, high), answer, choices: shuffle([answer, ...others], rng) };
}

/** Frequencies of a maqam's ascending scale from a tonic (quarter tones exact). */
export function maqamScaleFreqs(id: string, tonic: number): number[] {
  const m = MAQAMAT.find((x) => x.id === id)!;
  return m.up.map((c) => shiftCents(midiToFreq(tonic), c));
}

/** Seeded random numbers for tests (mulberry32). */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
