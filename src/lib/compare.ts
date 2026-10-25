// Comparing a sung pitch curve with a reference curve, ignoring octave differences.

import { centsBetween, wrapOctave } from './music';

/** One pitch reading at time t (seconds); freq = null when silent/unvoiced. */
export interface PitchPoint {
  t: number;
  freq: number | null;
}

export interface CompareResult {
  /** 0..100: share of voiced reference time she sang within tolerance. */
  score: number;
  /** Per reference point: cents off (octave-insensitive), or null if either side silent. */
  diffs: { t: number; cents: number | null }[];
  /** Time ranges (seconds) where she was off or silent while the reference sang. */
  offRanges: { start: number; end: number; avgCents: number | null }[];
}

/** Octave-insensitive cents difference between a sung and a reference frequency. */
export function octaveInsensitiveCents(sung: number, ref: number): number {
  return wrapOctave(centsBetween(sung, ref));
}

/** Reading of `curve` closest in time to t (curve sorted by t), if within maxGap seconds. */
export function sampleAt(curve: PitchPoint[], t: number, maxGap = 0.06): PitchPoint | null {
  let lo = 0;
  let hi = curve.length - 1;
  if (hi < 0) return null;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (curve[mid].t < t) lo = mid + 1;
    else hi = mid;
  }
  let best = curve[lo];
  if (lo > 0 && Math.abs(curve[lo - 1].t - t) < Math.abs(best.t - t)) best = curve[lo - 1];
  return Math.abs(best.t - t) <= maxGap ? best : null;
}

export function compareCurves(sung: PitchPoint[], ref: PitchPoint[], toleranceCents = 50, minOffSeconds = 0.3): CompareResult {
  const diffs: CompareResult['diffs'] = [];
  let voiced = 0;
  let good = 0;
  const raw: { t: number; off: boolean; cents: number | null }[] = [];

  for (const r of ref) {
    if (!r.freq) {
      diffs.push({ t: r.t, cents: null });
      continue;
    }
    voiced++;
    const s = sampleAt(sung, r.t);
    const cents = s?.freq ? octaveInsensitiveCents(s.freq, r.freq) : null;
    diffs.push({ t: r.t, cents });
    const off = cents === null || Math.abs(cents) > toleranceCents;
    if (!off) good++;
    raw.push({ t: r.t, off, cents });
  }

  // Group consecutive "off" reference points into ranges.
  const offRanges: CompareResult['offRanges'] = [];
  let cur: { start: number; end: number; cents: number[] } | null = null;
  const flush = () => {
    if (cur && cur.end - cur.start >= minOffSeconds) {
      offRanges.push({ start: cur.start, end: cur.end, avgCents: cur.cents.length ? Math.round(cur.cents.reduce((a, b) => a + b, 0) / cur.cents.length) : null });
    }
    cur = null;
  };
  for (let i = 0; i < raw.length; i++) {
    const p = raw[i];
    const gapFromPrev = i > 0 ? p.t - raw[i - 1].t : 0;
    if (p.off) {
      if (cur && gapFromPrev > 0.25) flush();
      if (!cur) cur = { start: p.t, end: p.t, cents: [] };
      cur.end = p.t;
      if (p.cents !== null) cur.cents.push(p.cents);
    } else {
      flush();
    }
  }
  flush();

  return { score: voiced ? Math.round((good / voiced) * 100) : 0, diffs, offRanges };
}

/** Move `freq` by whole octaves so it lands as close as possible to `ref` (for drawing). */
export function foldToOctaveOf(freq: number, ref: number): number {
  const octaves = Math.round(centsBetween(freq, ref) / 1200);
  return freq / Math.pow(2, octaves);
}
