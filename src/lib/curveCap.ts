// Keeping long songs cheap: live pitch logs that can't grow without limit, graphs that draw a bounded number of
// points, and a compact form of a song's pitch curve for the cache (so it's decoded only once).

import type { PitchPoint } from './compare';

/**
 * A time-stamped log with a ceiling. Readings closer than `minDt` seconds are skipped (the mic gives ~60 a second;
 * scoring only needs ~20), and at `cap` points every second one is dropped, so memory stays flat however long she sings.
 */
export class CurveLog<T extends { t: number }> {
  points: T[] = [];
  private lastT = -Infinity;
  private minDt: number;
  constructor(
    minDt = 0.045,
    private cap = 20000,
  ) {
    this.minDt = minDt;
  }
  /** true if the reading was kept */
  add(p: T): boolean {
    if (Math.abs(p.t - this.lastT) < this.minDt) return false;
    this.lastT = p.t;
    this.points.push(p);
    if (this.points.length >= this.cap) {
      this.points = this.points.filter((_, i) => i % 2 === 0);
      this.minDt *= 2;
    }
    return true;
  }
  clear() {
    this.points = [];
    this.lastT = -Infinity;
  }
  get length() {
    return this.points.length;
  }
}

/** At most `max` evenly spaced items (for drawing): the first and last are always kept. */
export function thinPoints<T>(list: T[], max: number): T[] {
  if (list.length <= max) return list;
  const out: T[] = [];
  const step = (list.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) out.push(list[Math.round(i * step)]);
  return out;
}

/** Min and max of a list of any length (Math.min(...list) throws on very long lists in Safari). */
export function minMax(list: Iterable<number>): { min: number; max: number } | null {
  let min = Infinity;
  let max = -Infinity;
  for (const v of list) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return min === Infinity ? null : { min, max };
}

export interface PackedCurve {
  start: number;
  hop: number;
  /** Hz per step; 0 = silence */
  freqs: Float32Array;
}

/** A regularly spaced curve as one typed array: a 5-minute song is 60 KB instead of 15,000 objects. */
export function packCurve(curve: PitchPoint[]): PackedCurve {
  const freqs = new Float32Array(curve.length);
  for (let i = 0; i < curve.length; i++) freqs[i] = curve[i].freq ?? 0;
  return { start: curve[0]?.t ?? 0, hop: curve.length > 1 ? (curve[curve.length - 1].t - curve[0].t) / (curve.length - 1) : 0, freqs };
}

export function unpackCurve(p: PackedCurve): PitchPoint[] {
  const out: PitchPoint[] = new Array(p.freqs.length);
  for (let i = 0; i < p.freqs.length; i++) out[i] = { t: p.start + i * p.hop, freq: p.freqs[i] > 0 ? p.freqs[i] : null };
  return out;
}

/** Scores kept for one looping session ("لحد ما أوقف" can go on for a long time). */
export const MAX_REPEAT_SCORES = 200;
export const pushCapped = (list: number[], v: number, cap = MAX_REPEAT_SCORES) => (list.length >= cap ? [...list.slice(1), v] : [...list, v]);
