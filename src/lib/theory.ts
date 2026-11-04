// Music theory the lessons show: note spelling, scales built step by step, intervals, chords, ajnas and maqam facts.
// Generated here (and tested against the maqam table) so the lesson text can't contradict what the exercises play.

import { MAQAMAT } from './maqam';

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const NATURAL = [0, 2, 4, 5, 7, 9, 11];
const SOLFEGE = ['دو', 'ري', 'مي', 'فا', 'صول', 'لا', 'سي'];

const ACCIDENTAL: Record<string, { sym: string; ar: string }> = {
  '0': { sym: '', ar: '' },
  '1': { sym: '♯', ar: ' دييز' },
  '-1': { sym: '♭', ar: ' بيمول' },
  '0.5': { sym: '½♯', ar: ' نص دييز' },
  '-0.5': { sym: '½♭', ar: ' نص بيمول' },
  '2': { sym: '𝄪', ar: ' دبل دييز' },
  '-2': { sym: '𝄫', ar: ' دبل بيمول' },
};

export interface SpelledNote {
  name: string;
  ar: string;
  /** cents above the tonic */
  cents: number;
}

/** "B♭" → pitch class in semitones (10). */
export function pcOfName(name: string): number {
  const l = LETTERS.indexOf(name[0]);
  const rest = name.slice(1);
  const acc = rest === '♯' ? 1 : rest === '♭' ? -1 : 0;
  return (NATURAL[l] + acc + 12) % 12;
}

/**
 * Names for notes above a tonic, each on its own letter (that's why G major has F♯ and not G♭).
 * `letterSteps`: how many letters above the tonic each note sits (default: one per note, a scale).
 */
export function spellDegrees(tonic: string, cents: number[], letterSteps?: number[]): SpelledNote[] {
  const l0 = LETTERS.indexOf(tonic[0]);
  const tonicSemis = NATURAL[l0] + (tonic.slice(1) === '♯' ? 1 : tonic.slice(1) === '♭' ? -1 : 0);
  return cents.map((c, i) => {
    const li = l0 + (letterSteps ? letterSteps[i] : i);
    const natural = NATURAL[li % 7] + 12 * Math.floor(li / 7);
    const diff = tonicSemis + c / 100 - natural;
    const acc = ACCIDENTAL[String(diff)] ?? ACCIDENTAL['0'];
    return { name: LETTERS[li % 7] + acc.sym, ar: SOLFEGE[li % 7] + acc.ar, cents: c };
  });
}

/** Steps between consecutive pitches, in cents. */
export const stepsOf = (cents: number[]) => cents.slice(1).map((c, i) => c - cents[i]);

const STEP_NAMES: Record<number, string> = { 100: 'نص تون', 150: 'تون إلا ربع', 200: 'تون', 300: 'تون ونص' };
export const stepName = (cents: number) => STEP_NAMES[cents] ?? `${cents} سنت`;

export type ScaleKind = 'major' | 'minor' | 'harmonic';

/** The patterns in steps: T = 200, S = 100, and 300 for the raised 7th's wide step. */
export const SCALE_PATTERNS: Record<ScaleKind, { ar: string; steps: number[] }> = {
  major: { ar: 'ماجير', steps: [200, 200, 100, 200, 200, 200, 100] },
  minor: { ar: 'مينور طبيعي', steps: [200, 100, 200, 200, 100, 200, 200] },
  harmonic: { ar: 'مينور بالسابعة المرفوعة', steps: [200, 100, 200, 200, 100, 300, 100] },
};

/** A scale built step by step from a tonic: its notes, spelled, and the steps between them. */
export function buildScale(kind: ScaleKind, tonic: string): { notes: SpelledNote[]; steps: number[] } {
  const steps = SCALE_PATTERNS[kind].steps;
  const cents = [0];
  for (const s of steps) cents.push(cents[cents.length - 1] + s);
  return { notes: spellDegrees(tonic, cents), steps };
}

/** Where a tonic sits relative to the C of her octave: close by, so the notes stay in her voice. */
export const tonicOffset = (tonic: string) => {
  const pc = pcOfName(tonic);
  return pc > 6 ? pc - 12 : pc;
};

// ---- intervals

export const INTERVALS: { semis: number; ar: string; en: string }[] = [
  { semis: 0, ar: 'نفس النغمة', en: 'unison' },
  { semis: 1, ar: 'تانية صغيرة', en: 'minor 2nd' },
  { semis: 2, ar: 'تانية كبيرة', en: 'major 2nd' },
  { semis: 3, ar: 'تالتة صغيرة', en: 'minor 3rd' },
  { semis: 4, ar: 'تالتة كبيرة', en: 'major 3rd' },
  { semis: 5, ar: 'رابعة تامة', en: 'perfect 4th' },
  { semis: 6, ar: 'تريتون', en: 'tritone' },
  { semis: 7, ar: 'خامسة تامة', en: 'perfect 5th' },
  { semis: 8, ar: 'سادسة صغيرة', en: 'minor 6th' },
  { semis: 9, ar: 'سادسة كبيرة', en: 'major 6th' },
  { semis: 10, ar: 'سابعة صغيرة', en: 'minor 7th' },
  { semis: 11, ar: 'سابعة كبيرة', en: 'major 7th' },
  { semis: 12, ar: 'أوكتاف', en: 'octave' },
];

// ---- chords

/** A basic chord symbol: "G" major, "Am" minor. Notes spelled, and semitones above the root. */
export function triad(symbol: string): { root: string; minor: boolean; notes: string[]; semis: number[] } {
  const minor = symbol.endsWith('m');
  const root = minor ? symbol.slice(0, -1) : symbol;
  const cents = minor ? [0, 300, 700] : [0, 400, 700];
  return { root, minor, notes: spellDegrees(root, cents, [0, 2, 4]).map((n) => n.name), semis: cents.map((c) => c / 100) };
}

/** The chords that belong to a major key: built on each note of its scale (the 7th's chord is rare at this level). */
export function keyChords(tonic: string): string[] {
  const names = buildScale('major', tonic).notes.map((n) => n.name);
  return [names[0], names[1] + 'm', names[2] + 'm', names[3], names[4], names[5] + 'm'];
}

/** Which major key a list of chords fits: every chord belongs to it. The first or last chord usually names it. */
export function keysForChords(chords: string[], candidates = ['C', 'G', 'D', 'A', 'E', 'F', 'B♭', 'E♭']): string[] {
  return candidates.filter((k) => chords.every((c) => keyChords(k).includes(c)));
}

// ---- maqamat

/** A jins: the small group of notes that gives a maqam its flavour (cents above its first note). */
export const AJNAS: { id: string; ar: string; en: string; cents: number[] }[] = [
  { id: 'rast', ar: 'جنس راست', en: 'Jins Rast', cents: [0, 200, 350, 500] },
  { id: 'bayati', ar: 'جنس بياتي', en: 'Jins Bayati', cents: [0, 150, 300, 500] },
  { id: 'hijaz', ar: 'جنس حجاز', en: 'Jins Hijaz', cents: [0, 100, 400, 500] },
  { id: 'nahawand', ar: 'جنس نهاوند', en: 'Jins Nahawand', cents: [0, 200, 300, 500] },
  { id: 'ajam', ar: 'جنس عجم', en: 'Jins Ajam', cents: [0, 200, 400, 500] },
  { id: 'kurd', ar: 'جنس كرد', en: 'Jins Kurd', cents: [0, 100, 300, 500] },
  { id: 'saba', ar: 'جنس صبا', en: 'Jins Saba', cents: [0, 150, 300, 400] },
];

/** Tonic it's usually taught on, and the degree (1 = the tonic) of its ghammaz, the second resting note. */
export const MAQAM_FACTS: Record<string, { tonic: string; ghammaz: number }> = {
  ajam: { tonic: 'B♭', ghammaz: 5 },
  nahawand: { tonic: 'C', ghammaz: 5 },
  kurd: { tonic: 'D', ghammaz: 4 },
  rast: { tonic: 'C', ghammaz: 5 },
  bayati: { tonic: 'D', ghammaz: 4 },
  hijaz: { tonic: 'D', ghammaz: 4 },
  saba: { tonic: 'D', ghammaz: 3 },
};

export interface MaqamChart {
  id: string;
  ar: string;
  en: string;
  tonic: string;
  up: SpelledNote[];
  /** the way down, if it differs from the way up */
  down: SpelledNote[] | null;
  steps: number[];
  jins: (typeof AJNAS)[number];
  ghammaz: SpelledNote;
  /** semitones from the C of her octave, for playing and lighting keys */
  offsets: number[];
}

/** Everything a lesson shows about a maqam, straight from the table the exercises use. */
export function maqamChart(id: string): MaqamChart {
  const m = MAQAMAT.find((x) => x.id === id);
  const facts = MAQAM_FACTS[id];
  if (!m || !facts) throw new Error('unknown maqam ' + id);
  const up = spellDegrees(facts.tonic, m.up);
  return {
    id,
    ar: m.ar,
    en: m.en,
    tonic: facts.tonic,
    up,
    down: m.down ? spellDegrees(facts.tonic, m.down).reverse() : null,
    steps: stepsOf(m.up),
    jins: AJNAS.find((j) => j.id === id)!,
    ghammaz: up[facts.ghammaz - 1],
    offsets: m.up.map((c) => tonicOffset(facts.tonic) + c / 100),
  };
}

// ---- rhythm

/** Note values, counted in beats when the beat is a quarter note. */
export const NOTE_VALUES: { ar: string; en: string; beats: number }[] = [
  { ar: 'مستديرة', en: 'whole note', beats: 4 },
  { ar: 'بيضا', en: 'half note', beats: 2 },
  { ar: 'سودا', en: 'quarter note', beats: 1 },
  { ar: 'كروش', en: 'eighth note', beats: 0.5 },
];
