// "🎹 البيانو": the on-screen keyboard (C2–C7, the piano samples' range) — key layout, names in both styles,
// target frequency (with quarter tones), and mapping a sung frequency to the nearest key.

import { centsBetween, freqToMidi, midiToFreq } from './music';

export const KEYBOARD_LOW = 36; // C2
export const KEYBOARD_HIGH = 96; // C7
export const MIDDLE_C = 60;

/** Success = within ±20 cents held for 1 s (same rule as pitch matching). */
export const PIANO_TOLERANCE = 20;
export const PIANO_HOLD_MS = 1000;

const BLACK = [false, true, false, true, false, false, true, false, true, false, true, false];
const LETTERS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const SOLFEGE = ['دو', 'دو#', 'ري', 'ري#', 'مي', 'فا', 'فا#', 'صول', 'صول#', 'لا', 'لا#', 'سي'];

export type LabelStyle = 'solfege' | 'letters' | 'both';
/** Quarter-tone offset of the target, in semitones. */
export type Quarter = -0.5 | 0 | 0.5;

export const isBlack = (midi: number) => BLACK[((midi % 12) + 12) % 12];
export const octaveOf = (midi: number) => Math.floor(midi / 12) - 1;

export interface PianoKey {
  midi: number;
  black: boolean;
  /** left edge, in white-key widths from the keyboard's left edge */
  x: number;
  /** width, in white-key widths */
  w: number;
}

/** Black keys are 0.6 of a white key wide, centred on the line between their two white neighbours. */
export function keyboardLayout(low = KEYBOARD_LOW, high = KEYBOARD_HIGH): { keys: PianoKey[]; whites: number } {
  const keys: PianoKey[] = [];
  let whites = 0;
  for (let m = low; m <= high; m++) {
    if (isBlack(m)) keys.push({ midi: m, black: true, x: whites - 0.3, w: 0.6 });
    else keys.push({ midi: m, black: false, x: whites++, w: 1 });
  }
  return { keys, whites };
}

/** Left edge (white-key widths) of a key, for scrolling to it. */
export function keyX(midi: number, low = KEYBOARD_LOW): number {
  return keyboardLayout(low, Math.max(low, midi)).keys.find((k) => k.midi === midi)?.x ?? 0;
}

/** The key's name in the chosen style; the octave number is separate (shown small). */
export function keyLabel(midi: number, style: LabelStyle): { main: string; second?: string; octave: number } {
  const pc = ((midi % 12) + 12) % 12;
  const octave = octaveOf(midi);
  if (style === 'solfege') return { main: SOLFEGE[pc], octave };
  if (style === 'letters') return { main: LETTERS[pc], octave };
  return { main: SOLFEGE[pc], second: LETTERS[pc], octave };
}

/** Frequency to sing for a key, moved by a quarter tone if asked (half-flat −0.5 / half-sharp +0.5). */
export function targetFreq(midi: number, quarter: Quarter = 0): number {
  return midiToFreq(midi + quarter);
}

/** A pitch that may be a quarter tone (63.5) as a key + offset, spelled like the maqam names: half-flat of a white key
 * above (E½♭ = E −0.5), otherwise half-sharp of the key below (F½♯ = F +0.5). */
export function toKeyQuarter(midi: number): { key: number; quarter: Quarter } {
  const r = Math.round(midi * 2) / 2;
  if (Number.isInteger(r)) return { key: r, quarter: 0 };
  const upper = Math.ceil(r);
  return isBlack(upper) ? { key: Math.floor(r), quarter: 0.5 } : { key: upper, quarter: -0.5 };
}

/** How far a sung frequency is from the target, in cents (+ = too high). */
export function centsToTarget(freq: number, midi: number, quarter: Quarter = 0): number {
  return centsBetween(freq, targetFreq(midi, quarter));
}

/** The key she's actually singing: nearest key and how far off it (−50…+50 cents); `onKeyboard` = inside C2–C7. */
export function nearestKey(freq: number, low = KEYBOARD_LOW, high = KEYBOARD_HIGH): { midi: number; cents: number; onKeyboard: boolean } {
  const exact = freqToMidi(freq);
  const midi = Math.round(exact);
  return { midi, cents: Math.round((exact - midi) * 100), onKeyboard: midi >= low && midi <= high };
}

/** Gentle note for keys outside her comfortable range. */
export function rangeNote(midi: number, low: number, high: number): 'high' | 'low' | null {
  if (midi > high) return 'high';
  if (midi < low) return 'low';
  return null;
}

// ---- names for memorizing the keyboard

const SHARP_SYM = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const FLAT_SYM = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
const pcOf = (midi: number) => ((midi % 12) + 12) % 12;

/** "E2" + "مي"; a black key has both spellings ("D♯2" and "E♭2"). */
export function keyNames(midi: number): { letter: string; flat?: string; solfege: string } {
  const pc = pcOf(midi);
  const o = octaveOf(midi);
  return { letter: SHARP_SYM[pc] + o, ...(isBlack(midi) ? { flat: FLAT_SYM[pc] + o } : {}), solfege: SOLFEGE[pc] };
}

/** The big label above the keyboard: "مي — E2", "ري# — D♯2 / E♭2". */
export function chosenLabel(midi: number): string {
  const n = keyNames(midi);
  return `${n.solfege} — ${n.letter}${n.flat ? ` / ${n.flat}` : ''}`;
}

/** Every key with the same name, across the octaves. */
export function sameNameKeys(midi: number, low = KEYBOARD_LOW, high = KEYBOARD_HIGH): number[] {
  const out: number[] = [];
  for (let m = low; m <= high; m++) if (pcOf(m) === pcOf(midi)) out.push(m);
  return out;
}

/**
 * "غنّيها في الأوكتاف بتاعي": the same note name where she can sing it. Inside her comfortable range, nearest to what
 * she's actually singing (or to the note she picked); if the range has none, the closest on the keyboard.
 */
export function retargetToRange(midi: number, low: number, high: number, sung: number | null = null): number {
  const all = sameNameKeys(midi);
  const inRange = all.filter((m) => m >= low && m <= high);
  const from = sung ?? midi;
  const middle = (low + high) / 2;
  const pool = inRange.length ? inRange : all;
  const anchor = inRange.length ? from : middle;
  return pool.reduce((best, m) => (Math.abs(m - anchor) < Math.abs(best - anchor) ? m : best), pool[0]);
}

/** How many whole octaves she keeps singing off (+ above, − below); 0 = not an octave problem. Last readings in cents. */
export function octavesOff(rawCents: number[], minReadings = 10): number {
  if (rawCents.length < minReadings) return 0;
  const sorted = [...rawCents].sort((a, b) => a - b);
  const k = Math.round(sorted[Math.floor(sorted.length / 2)] / 1200);
  if (k === 0) return 0;
  const near = rawCents.filter((c) => Math.abs(c - k * 1200) <= 80).length;
  return near / rawCents.length >= 0.7 ? k : 0;
}

// ---- the mini-map (fractions of the whole keyboard, 0..1)

const WHOLE = keyboardLayout();
const KEY_BY_MIDI = new Map(WHOLE.keys.map((k) => [k.midi, k]));
export const WHITE_COUNT = WHOLE.whites;

/** Where a key's centre sits on the whole keyboard. */
export function keyFraction(midi: number): number {
  const k = KEY_BY_MIDI.get(midi);
  return k ? (k.x + k.w / 2) / WHOLE.whites : 0;
}

/** The frame showing which part is on screen. `pad` = the scroller's padding on each side. */
export function miniFrame(scrollLeft: number, clientWidth: number, keysWidth: number, pad = 0): { left: number; width: number } {
  const width = Math.min(1, clientWidth / keysWidth);
  const left = Math.max(0, Math.min(1 - width, (scrollLeft - pad) / keysWidth));
  return { left, width };
}

/** Tapping or dragging the mini-map: the scroll position that centres that point. */
export function scrollForFraction(f: number, clientWidth: number, keysWidth: number, pad = 0): number {
  const max = Math.max(0, keysWidth + 2 * pad - clientWidth);
  return Math.max(0, Math.min(max, Math.max(0, Math.min(1, f)) * keysWidth + pad - clientWidth / 2));
}

/**
 * While singing: scroll only if the key she's hitting is out of view, and keep the target on screen. If both can't fit
 * the target wins (the mini-map's dot shows where her voice is). Null = don't move. Positions are px along the keys.
 */
export function scrollToKeep(hitX: number, targetX: number | null, keyW: number, scrollLeft: number, clientWidth: number, pad = 0): number | null {
  const left = scrollLeft - pad;
  const inView = (x: number) => x >= left && x + keyW <= left + clientWidth;
  if (inView(hitX)) return null;
  if (targetX === null) return Math.max(0, hitX + pad - (clientWidth - keyW) / 2);
  const lo = Math.min(hitX, targetX);
  const hi = Math.max(hitX, targetX) + keyW;
  if (hi - lo <= clientWidth) return Math.max(0, (lo + hi) / 2 + pad - clientWidth / 2);
  return inView(targetX) ? null : Math.max(0, targetX + pad - (clientWidth - keyW) / 2);
}
