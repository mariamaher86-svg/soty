// "🎚️ العالي والواطي": crescendo / decrescendo / messa di voce on one steady note. Two scores: how smoothly the
// loudness follows the shape, and how steady the pitch stays while it changes.

import { centsBetween } from './music';
import { median } from './stats';

export type DynamicsKind = 'cresc' | 'decresc' | 'messa';

export const DYNAMICS_KINDS: { id: DynamicsKind; ar: string; what: string; seconds: number }[] = [
  { id: 'cresc', ar: 'من واطي لعالي', what: 'ابدئي هادي جدًا وعلّي الصوت بالراحة لحد الآخر.', seconds: 6 },
  { id: 'decresc', ar: 'من عالي لواطي', what: 'ابدئي بصوت مليان ووطّيه بالراحة لحد ما يبقى همس.', seconds: 6 },
  { id: 'messa', ar: 'واطي ← عالي ← واطي', what: 'مسا دي فوتشي: هادي، وبعدين أعلى في النص، وترجعي هادي — من غير ما النغمة تتهز.', seconds: 8 },
];

export interface DynFrame {
  t: number; // seconds from the start
  rms: number;
  freq: number | null;
}

export const toDb = (rms: number) => 20 * Math.log10(Math.max(rms, 1e-6));

/** The target shape, 0 (soft) … 1 (loud), at fraction x of the exercise. */
export function targetShape(kind: DynamicsKind, x: number): number {
  const f = Math.max(0, Math.min(1, x));
  if (kind === 'cresc') return f;
  if (kind === 'decresc') return 1 - f;
  return f < 0.5 ? f * 2 : 2 - f * 2;
}

/** Least-squares line through points → residual RMS and slope. */
function fit(xs: number[], ys: number[]): { slope: number; resid: number } {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
  }
  const slope = sxx ? sxy / sxx : 0;
  let r = 0;
  for (let i = 0; i < n; i++) r += (ys[i] - (my + slope * (xs[i] - mx))) ** 2;
  return { slope, resid: Math.sqrt(r / n) };
}

const smooth = (v: number[], k = 3) => v.map((_, i) => {
  const a = v.slice(Math.max(0, i - k), i + k + 1);
  return a.reduce((x, y) => x + y, 0) / a.length;
});

export interface DynamicsScore {
  /** 0..100: loudness changes evenly, in the right direction, by enough */
  loudness: number;
  /** 0..100: pitch steady while the loudness changes */
  pitch: number;
  total: number;
  /** loudness range used, dB */
  rangeDb: number;
  /** pitch wobble (SD around her own note), cents */
  sdCents: number;
  /** her note (median, Hz) */
  freq: number | null;
  peakDb: number;
}

/**
 * Smooth = the loudness (dB, lightly smoothed) is close to a straight ramp in each half/whole, rising or falling as
 * asked, and spans at least ~10 dB (less = partial credit). Steady pitch = SD ≤ 10 cents → 100, ≥ 50 → 0.
 */
export function scoreDynamics(frames: DynFrame[], kind: DynamicsKind): DynamicsScore | null {
  const voiced = frames.filter((f) => f.freq !== null);
  if (voiced.length < 20) return null;
  const db = smooth(voiced.map((f) => toDb(f.rms)));
  const ts = voiced.map((f) => f.t);
  const t0 = ts[0];
  const t1 = ts[ts.length - 1];
  const segs: { from: number; to: number; dir: 1 | -1 }[] =
    kind === 'cresc' ? [{ from: t0, to: t1, dir: 1 }] : kind === 'decresc' ? [{ from: t0, to: t1, dir: -1 }] : [{ from: t0, to: (t0 + t1) / 2, dir: 1 }, { from: (t0 + t1) / 2, to: t1, dir: -1 }];
  let smoothPts = 0;
  for (const s of segs) {
    const idx = ts.map((t, i) => (t >= s.from && t <= s.to ? i : -1)).filter((i) => i >= 0);
    if (idx.length < 5) continue;
    const xs = idx.map((i) => ts[i]);
    const ys = idx.map((i) => db[i]);
    const { slope, resid } = fit(xs, ys);
    const change = slope * (s.to - s.from) * s.dir; // dB in the asked direction
    const dirOk = Math.max(0, Math.min(1, change / 10)); // ≥ 10 dB the right way = full
    const even = Math.max(0, Math.min(1, 1 - (resid - 1) / 4)); // ≤ 1 dB off the ramp = full, ≥ 5 dB = 0
    smoothPts += dirOk * even;
  }
  const loudness = Math.round((smoothPts / segs.length) * 100);
  const freqs = voiced.map((f) => f.freq!) as number[];
  const mid = median(freqs);
  const cents = freqs.map((f) => centsBetween(f, mid));
  const sd = Math.sqrt(cents.reduce((a, c) => a + c * c, 0) / cents.length);
  const pitch = Math.round(Math.max(0, Math.min(1, (50 - sd) / 40)) * 100);
  return {
    loudness,
    pitch,
    total: Math.round((loudness + pitch) / 2),
    rangeDb: Math.round(Math.max(...db) - Math.min(...db)),
    sdCents: Math.round(sd),
    freq: mid,
    peakDb: Math.max(...db),
  };
}

/** Gentle warning: a note near the top of her range sung loud (tires and strains the voice). */
export function loudHighWarning(midi: number, rangeHigh: number, peakDb: number | null = null): boolean {
  const high = midi >= rangeHigh - 3;
  return peakDb === null ? high : high && peakDb > -14;
}
