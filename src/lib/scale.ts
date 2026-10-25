// "Is she singing inside the song's scale?" — octave-insensitive, quarter tones allowed.

import type { PitchPoint } from './compare';
import { MAQAMAT } from './maqam';
import { centsBetween, quarterToneName } from './music';
import { median } from './stats';

export interface Scale {
  id: string;
  ar: string;
  /** Pitch classes in cents above the tonic, 0..1199. */
  pcs: number[];
  /** Spell with flats where a note could be read either way (Arabic convention for maqamat). */
  flats?: boolean;
  /** English name. */
  en: string;
  /** Ascending scale to play (cents, tonic .. octave). */
  up: number[];
}

/** Every pitch a scale uses (ascending and descending forms), folded into one octave. */
function pitchClasses(...lists: number[][]): number[] {
  return [...new Set(lists.flat().map((c) => ((c % 1200) + 1200) % 1200))].sort((a, b) => a - b);
}

// Western scales first, then every maqam from the maqam table (so new maqamat show up here too).
export const SCALES: Scale[] = [
  { id: 'major', ar: 'ماجير (كبير)', en: 'major', pcs: [0, 200, 400, 500, 700, 900, 1100], up: [0, 200, 400, 500, 700, 900, 1100, 1200] },
  // natural + harmonic minor: the raised 7th is common in songs
  { id: 'minor', ar: 'مينور (صغير)', en: 'minor', pcs: pitchClasses([0, 200, 300, 500, 700, 800, 1000], [1100]), up: [0, 200, 300, 500, 700, 800, 1000, 1200] },
  ...MAQAMAT.map((m) => ({ id: m.id, ar: `مقام ${m.ar}`, en: m.en, pcs: pitchClasses(m.up, m.down ?? []), flats: true, up: m.up })),
];

/** Circular distance between two pitch classes in cents (0..600). */
function pcDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 1200;
  return Math.min(d, 1200 - d);
}

/** Nearest scale degree to a frequency (any octave) and how far from it, signed, in cents. */
export function nearestDegree(freq: number, tonicFreq: number, pcs: number[]): { pc: number; cents: number } {
  const c = ((centsBetween(freq, tonicFreq) % 1200) + 1200) % 1200;
  let best = pcs[0];
  for (const pc of pcs) if (pcDistance(c, pc) < pcDistance(c, best)) best = pc;
  let signed = c - best;
  if (signed > 600) signed -= 1200;
  if (signed < -600) signed += 1200;
  return { pc: best, cents: signed };
}

export function inScale(freq: number, tonicFreq: number, pcs: number[], toleranceCents = 40): boolean {
  return Math.abs(nearestDegree(freq, tonicFreq, pcs).cents) <= toleranceCents + 1e-6;
}

export interface ScaleCheck {
  /** 0..100: share of her sung (voiced) time that was in the scale. */
  percentInScale: number;
  /** Moments (seconds) where she held a note outside the scale. */
  outRanges: { start: number; end: number; cents: number }[];
}

/**
 * Checks a sung curve against a scale. Silence is ignored; each reading is smoothed over
 * ~smoothSeconds (so vibrato and glides between notes don't count), and an out-of-scale
 * moment must last at least minSeconds to be flagged.
 */
export function checkScale(sung: PitchPoint[], tonicFreq: number, pcs: number[], toleranceCents = 40, minSeconds = 0.25, smoothSeconds = 0.15): ScaleCheck {
  const voiced = sung.filter((p) => p.freq) as { t: number; freq: number }[];
  if (!voiced.length) return { percentInScale: 0, outRanges: [] };
  const raw = voiced.map((p) => nearestDegree(p.freq, tonicFreq, pcs).cents);
  // median over a short time window around each reading
  const devs = voiced.map((p, i) => {
    const near: number[] = [];
    for (let j = i; j >= 0 && p.t - voiced[j].t <= smoothSeconds / 2; j--) near.push(raw[j]);
    for (let j = i + 1; j < voiced.length && voiced[j].t - p.t <= smoothSeconds / 2; j++) near.push(raw[j]);
    return median(near);
  });

  const outRanges: ScaleCheck['outRanges'] = [];
  let outFrames = 0;
  let run: { from: number; to: number } | null = null;
  const flush = () => {
    if (run) {
      const start = voiced[run.from].t;
      const end = voiced[run.to].t;
      if (end - start >= minSeconds) {
        outRanges.push({ start, end, cents: Math.round(median(devs.slice(run.from, run.to + 1))) });
        outFrames += run.to - run.from + 1;
      }
    }
    run = null;
  };
  for (let i = 0; i < voiced.length; i++) {
    const out = Math.abs(devs[i]) > toleranceCents + 1e-6;
    const gap = i > 0 ? voiced[i].t - voiced[i - 1].t : 0;
    if (run && (!out || gap > 0.15)) flush();
    if (out) {
      if (!run) run = { from: i, to: i };
      run.to = i;
    }
  }
  flush();
  return { percentInScale: Math.round(((voiced.length - outFrames) / voiced.length) * 100), outRanges };
}

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTERS_AR = ['دو', 'ري', 'مي', 'فا', 'صول', 'لا', 'سي'];
const LETTER_PC = [0, 200, 400, 500, 700, 900, 1100];
/** Tonic choices (semitones above C), spelled the usual way. */
export const TONICS = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export const TONICS_AR = ['دو', 'ري بيمول', 'ري', 'مي بيمول', 'مي', 'فا', 'فا دييز', 'صول', 'لا بيمول', 'لا', 'سي بيمول', 'سي'];

const ACCIDENTALS: Record<number, [string, string]> = {
  0: ['', ''],
  [-100]: ['♭', ' بيمول'],
  100: ['♯', ' دييز'],
  [-50]: ['½♭', ' نص بيمول'],
  50: ['½♯', ' نص دييز'],
  [-200]: ['𝄫', ' دبل بيمول'],
  200: ['𝄪', ' دبل دييز'],
};

function spell(letter: number, absCents: number): { name: string; ar: string } {
  let acc = (((absCents - LETTER_PC[letter]) % 1200) + 1200) % 1200;
  if (acc > 600) acc -= 1200;
  const [sym, ar] = ACCIDENTALS[Math.round(acc / 50) * 50] ?? ['?', ''];
  return { name: LETTERS[letter] + sym, ar: LETTERS_AR[letter] + ar };
}

/**
 * Note names of a scale from a tonic, one letter per degree where possible
 * (G major -> F♯ not G♭; Saba on D -> G♭; Rast on C -> E½♭ and both B½♭ / B♭).
 */
export function spellScale(tonicPc: number, pcs: number[], flats = false): { pc: number; name: string; ar: string }[] {
  if (!Number.isInteger(tonicPc)) {
    // quarter-tone tonic (e.g. a detuned recording): plain quarter-tone names
    return [...pcs].sort((a, b) => a - b).map((pc) => {
      const n = quarterToneName(60 + tonicPc + pc / 100);
      return { pc, name: n.name.replace(/-?\d+$/, ''), ar: n.ar.replace(/ -?\d+$/, '') };
    });
  }
  const tonicLetter = LETTERS.indexOf(TONICS[tonicPc][0]);
  const used = new Set<number>();
  return [...pcs].sort((a, b) => a - b).map((pc) => {
    let k = Math.min(6, Math.round(pc / (1200 / 7)));
    // a second note on the same letter moves to the next letter if that reads naturally (Saba's G♭);
    // with flats it may even take the octave's letter (Saba's D♭ instead of C♯)
    if (used.has(k) && k < (flats ? 7 : 6) && !used.has(k + 1)) {
      const next = spell((tonicLetter + k + 1) % 7, tonicPc * 100 + pc);
      if (!next.name.includes('𝄫') && !next.name.includes('?')) k = k + 1;
    }
    used.add(k);
    return { pc, ...spell((tonicLetter + k) % 7, tonicPc * 100 + pc) };
  });
}

/** Name of a tonic given in semitones above C (steps of 0.5). */
export function tonicName(tonic: number): { name: string; ar: string } {
  if (Number.isInteger(tonic)) return { name: TONICS[tonic], ar: TONICS_AR[tonic] };
  const n = quarterToneName(60 + tonic);
  return { name: n.name.replace(/-?\d+$/, ''), ar: n.ar.replace(/ -?\d+$/, '') };
}
