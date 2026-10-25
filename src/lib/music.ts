// Basic pitch math: frequency <-> MIDI note <-> cents, and note names.

export const A4 = 440;

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const SOLFEGE_AR = ['دو', 'دو#', 'ري', 'ري#', 'مي', 'فا', 'فا#', 'صول', 'صول#', 'لا', 'لا#', 'سي'];

/** Fractional MIDI number (69 = A4). */
export function freqToMidi(freq: number): number {
  return 69 + 12 * Math.log2(freq / A4);
}

export function midiToFreq(midi: number): number {
  return A4 * Math.pow(2, (midi - 69) / 12);
}

/** How many cents `freq` is above `ref` (negative = below). */
export function centsBetween(freq: number, ref: number): number {
  return 1200 * Math.log2(freq / ref);
}

/** Shift a frequency by some cents. */
export function shiftCents(freq: number, cents: number): number {
  return freq * Math.pow(2, cents / 1200);
}

/** "A4", "C#3" ... for a whole MIDI number. */
export function noteName(midi: number): string {
  const m = Math.round(midi);
  return SHARP_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
}

/** Arabic solfege name, e.g. "لا" for A, with octave number: "لا 4". */
export function noteNameAr(midi: number): string {
  const m = Math.round(midi);
  return `${SOLFEGE_AR[((m % 12) + 12) % 12]} ${Math.floor(m / 12) - 1}`;
}

/** Nearest 12-TET note of a frequency and how far off it is in cents. */
export function nearestNote(freq: number): { midi: number; cents: number } {
  const exact = freqToMidi(freq);
  const midi = Math.round(exact);
  return { midi, cents: (exact - midi) * 100 };
}

const FLAT_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
const FLAT_AR = ['دو', 'ري بيمول', 'ري', 'مي بيمول', 'مي', 'فا', 'صول بيمول', 'صول', 'لا بيمول', 'لا', 'سي بيمول', 'سي'];
const NATURAL = [true, false, true, false, true, true, false, true, false, true, false, true];

/**
 * Name of a scale pitch that may sit on a quarter tone, spelled the Arabic-music way (with flats):
 * 63.5 -> "E½♭4" / "مي نص بيمول 4", 65.5 -> "F½♯4" / "فا نص دييز 4". `midi` may be fractional in steps of 0.5.
 */
export function quarterToneName(midi: number): { name: string; ar: string } {
  const halfSteps = Math.round(midi * 2);
  const name = (m: number, suffix = '', arSuffix = '') => {
    const pc = ((m % 12) + 12) % 12;
    const oct = Math.floor(m / 12) - 1;
    return { name: FLAT_NAMES[pc] + suffix + oct, ar: `${FLAT_AR[pc]}${arSuffix} ${oct}` };
  };
  if (halfSteps % 2 === 0) return name(halfSteps / 2);
  const upper = (halfSteps + 1) / 2;
  const lower = upper - 1;
  // Prefer "half-flat" of a natural note (E½♭); otherwise "half-sharp" of the natural below (F½♯).
  if (NATURAL[((upper % 12) + 12) % 12]) return name(upper, '½♭', ' نص بيمول');
  return name(lower, '½♯', ' نص دييز');
}

/** Wrap a cents difference into (-600, 600] so octave errors are ignored. */
export function wrapOctave(cents: number): number {
  const r = (((cents + 600) % 1200) + 1200) % 1200 - 600;
  return r === -600 ? 600 : r;
}
