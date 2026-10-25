// "Which key / maqam is this song in?" from a pitch-class histogram (24 bins = quarter tones).

import { SCALES, tonicName } from './scale';
import { centsBetween, midiToFreq } from './music';
import { median } from './stats';

export const BINS = 24; // 50 cents each
const C4 = midiToFreq(60);

/** Pitch class of a frequency in cents above C (0..1199.99). */
export function pitchClassCents(freq: number): number {
  return ((centsBetween(freq, C4) % 1200) + 1200) % 1200;
}

/** Adds `weight` to a histogram, split between the two nearest bins (so a slightly off note still counts). */
export function addToHistogram(hist: number[], freq: number, weight: number) {
  const pos = pitchClassCents(freq) / (1200 / BINS);
  const lo = Math.floor(pos) % BINS;
  const frac = pos - Math.floor(pos);
  hist[lo] += weight * (1 - frac);
  hist[(lo + 1) % BINS] += weight * frac;
}

export interface KeyFrame {
  /** seconds */
  t: number;
  freq: number | null;
  /** pitch detector clarity 0..1 */
  clarity: number;
}

/**
 * Histogram from live pitch frames, weighted by duration × clarity. Silence is skipped; pitches are
 * median-smoothed over ~0.15 s (cancels vibrato) and frames that are still moving fast (slides) are skipped.
 */
export function histogramFromFrames(frames: KeyFrame[], maxSlideCentsPerSec = 300): number[] {
  const hist = new Array(BINS).fill(0);
  const v = frames.filter((f) => f.freq) as { t: number; freq: number; clarity: number }[];
  const abs = v.map((f) => centsBetween(f.freq, C4));
  const smooth = v.map((f, i) => {
    const near: number[] = [];
    for (let j = i; j >= 0 && f.t - v[j].t <= 0.075; j--) near.push(abs[j]);
    for (let j = i + 1; j < v.length && v[j].t - f.t <= 0.075; j++) near.push(abs[j]);
    return median(near);
  });
  for (let i = 1; i < v.length; i++) {
    const dt = v[i].t - v[i - 1].t;
    if (dt <= 0 || dt > 0.1) continue; // a gap: no duration to give
    if (Math.abs(smooth[i] - smooth[i - 1]) / dt > maxSlideCentsPerSec) continue;
    addToHistogram(hist, C4 * Math.pow(2, smooth[i] / 1200), dt * v[i].clarity);
  }
  return hist;
}

export interface KeyCandidate {
  /** tonic in semitones above C, steps of 0.5 (quarter tones) */
  tonic: number;
  /** ids of the scales with exactly these notes (e.g. major + ajam) */
  scaleIds: string[];
  score: number;
  /** 0..1, share among the shown candidates */
  probability: number;
  confidence: 'high' | 'medium' | 'low';
}

/** Template for one scale from one tonic bin: 1 on scale notes, more on the tonic and the 5th. */
function template(tonicBin: number, pcs: number[]): number[] {
  const t = new Array(BINS).fill(0);
  for (const pc of pcs) {
    const b = (tonicBin + Math.round(pc / 50)) % BINS;
    t[b] = pc === 0 ? 1.6 : pc === 700 ? 1.25 : 1;
  }
  return t;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/**
 * Most likely keys/maqamat for a histogram. `tonicHint` = frequency of the note the song ends on
 * (optional): candidates with that tonic get a strong bonus.
 */
export function detectKey(hist: number[], tonicHint: number | null = null, top = 3): KeyCandidate[] {
  const hintBin = tonicHint ? pitchClassCents(tonicHint) / 50 : null;
  const byNotes = new Map<string, { tonic: number; scaleIds: string[]; score: number }>();
  for (let tb = 0; tb < BINS; tb++) {
    for (const s of SCALES) {
      const tpl = template(tb, s.pcs);
      let score = cosine(hist, tpl);
      if (hintBin !== null) {
        const d = Math.min(Math.abs(hintBin - tb), BINS - Math.abs(hintBin - tb)); // in bins
        score += 0.15 * Math.max(0, 1 - d);
      }
      // scales with the same notes from the same tonic (major = ajam, ...) are one answer
      const key = tb + ':' + tpl.map((x) => (x ? 1 : 0)).join('');
      const cur = byNotes.get(key);
      if (cur) cur.scaleIds.push(s.id);
      else byNotes.set(key, { tonic: tb / 2, scaleIds: [s.id], score });
    }
  }
  const ranked = [...byNotes.values()].sort((a, b) => b.score - a.score).slice(0, Math.max(top, 3));
  // softmax over the best few: a clear winner gets most of the share
  const exps = ranked.map((c) => Math.exp((c.score - ranked[0].score) / 0.02));
  const sum = exps.reduce((a, b) => a + b, 0);
  return ranked.slice(0, top).map((c, i) => {
    const probability = exps[i] / sum;
    return { ...c, probability, confidence: probability >= 0.6 ? 'high' : probability >= 0.3 ? 'medium' : 'low' };
  });
}

/** Seconds of usable (weighted) singing in a histogram. */
export function histogramSeconds(hist: number[]): number {
  return hist.reduce((a, b) => a + b, 0);
}

/** "صول ماجير / مقام عجم" and "G major / Ajam" for a candidate. */
export function keyLabel(c: { tonic: number; scaleIds: string[] }): { ar: string; en: string } {
  const t = tonicName(c.tonic);
  const scales = c.scaleIds.map((id) => SCALES.find((s) => s.id === id)!);
  return {
    ar: `${t.ar} ${scales.map((s) => s.ar.replace(/ \(.*\)$/, '')).join(' / ')}`,
    en: `${t.name} ${scales.map((s) => s.en).join(' / ')}`,
  };
}
