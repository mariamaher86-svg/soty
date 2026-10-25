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
