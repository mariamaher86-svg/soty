// Arabic maqamat. To add a maqam just add a row to MAQAMAT.
// Intervals are cents above the tonic, 8 degrees (tonic .. octave), using the
// common quarter-tone approximation (150 = three-quarter tone, 350 = neutral third, ...).

import { shiftCents } from './music';

export interface Maqam {
  id: string;
  ar: string;
  en: string;
  /** Ascending degrees in cents from the tonic. */
  up: number[];
  /** Descending degrees (listed low -> high) when they differ from `up`. */
  down?: number[];
  /** Traditional tonic as a MIDI note (only to show the usual key). */
  usualTonic: number;
}

export const MAQAMAT: Maqam[] = [
  // Rast on C: C D E½♭ F G A B½♭ C — descending uses B♭.
  { id: 'rast', ar: 'راست', en: 'Rast', up: [0, 200, 350, 500, 700, 900, 1050, 1200], down: [0, 200, 350, 500, 700, 900, 1000, 1200], usualTonic: 60 },
  // Bayati on D: D E½♭ F G A B♭ C D
  { id: 'bayati', ar: 'بياتي', en: 'Bayati', up: [0, 150, 300, 500, 700, 800, 1000, 1200], usualTonic: 62 },
  // Hijaz on D: D E♭ F# G A B♭ C D
  { id: 'hijaz', ar: 'حجاز', en: 'Hijaz', up: [0, 100, 400, 500, 700, 800, 1000, 1200], usualTonic: 62 },
  // Nahawand on C: C D E♭ F G A♭ B C — descending uses B♭.
  { id: 'nahawand', ar: 'نهاوند', en: 'Nahawand', up: [0, 200, 300, 500, 700, 800, 1100, 1200], down: [0, 200, 300, 500, 700, 800, 1000, 1200], usualTonic: 60 },
  // Ajam on B♭: like a major scale.
  { id: 'ajam', ar: 'عجم', en: 'Ajam', up: [0, 200, 400, 500, 700, 900, 1100, 1200], usualTonic: 58 },
  // Saba on D: D E½♭ F G♭ A B♭ C D♭ (the octave is diminished).
  { id: 'saba', ar: 'صبا', en: 'Saba', up: [0, 150, 300, 400, 700, 800, 1000, 1100], usualTonic: 62 },
  // Kurd on D: D E♭ F G A B♭ C D
  { id: 'kurd', ar: 'كرد', en: 'Kurd', up: [0, 100, 300, 500, 700, 800, 1000, 1200], usualTonic: 62 },
];

export type Direction = 'up' | 'down' | 'both';

export interface Degree {
  /** 1-based degree number within the scale. */
  degree: number;
  cents: number;
  freq: number;
}

/** The sequence of target pitches to sing for a maqam from a given tonic frequency. */
export function maqamSequence(maqam: Maqam, tonicFreq: number, direction: Direction): Degree[] {
  const toDegree = (cents: number, i: number): Degree => ({ degree: i + 1, cents, freq: shiftCents(tonicFreq, cents) });
  const up = maqam.up.map(toDegree);
  const down = (maqam.down ?? maqam.up).map(toDegree).reverse();
  if (direction === 'up') return up;
  if (direction === 'down') return down;
  return [...up, ...down.slice(1)];
}

/** A tonic (whole MIDI note) so the whole octave fits inside the singer's range, preferring the lower part. */
export function chooseTonic(low: number, high: number): number {
  const top = high - 12;
  if (top < low) return Math.round(low); // range smaller than an octave: start at the bottom
  return Math.round(Math.min(low + 2, top));
}
