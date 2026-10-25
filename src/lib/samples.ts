// Pure helpers for playing recorded notes (piano, choir, teacher) at any pitch.

import type { PitchPoint } from './compare';
import { centsBetween } from './music';
import { median } from './stats';

/** playbackRate that turns a sample recorded at sampleFreq into targetFreq (exact, any cents). */
export function playbackRate(sampleFreq: number, targetFreq: number): number {
  return targetFreq / sampleFreq;
}

/** The sample closest in pitch to the target (smallest shift = most natural sound). */
export function nearestSample<T extends { freq: number }>(samples: T[], targetFreq: number): T | undefined {
  let best: T | undefined;
  let bestDist = Infinity;
  for (const s of samples) {
    const d = Math.abs(centsBetween(targetFreq, s.freq));
    if (d < bestDist - 1e-9) {
      best = s;
      bestDist = d;
    }
  }
  return best;
}

/** Use a measured sample pitch if it is close to the nominal note, else trust the nominal one. */
export function trustedFreq(nominal: number, measured: number | null, maxCents = 50): number {
  if (measured === null) return nominal;
  return Math.abs(centsBetween(measured, nominal)) <= maxCents ? measured : nominal;
}

/**
 * Real pitches for a sample set: each sample's measured pitch when it is trustworthy; samples that
 * could not be measured get the set's typical (median) tuning offset, since a set is usually off
 * by about the same amount everywhere (e.g. the choir is a bit flat).
 */
export function tuneSampleSet(nominal: number[], measured: (number | null)[], maxCents = 50): number[] {
  const offsets = nominal.flatMap((n, i) => {
    const m = measured[i];
    return m !== null && Math.abs(centsBetween(m, n)) <= maxCents ? [centsBetween(m, n)] : [];
  });
  const typical = offsets.length ? median(offsets) : 0;
  return nominal.map((n, i) => {
    const m = measured[i];
    if (m !== null && Math.abs(centsBetween(m, n)) <= maxCents) return m;
    return n * Math.pow(2, typical / 1200);
  });
}

/**
 * Longest stretch where the pitch stays within ±toleranceCents of that stretch's median
 * (the steady part of a sung note). Returns null if no stretch is at least minSeconds long.
 */
export function steadySegment(curve: PitchPoint[], toleranceCents = 40, minSeconds = 0.4): { start: number; end: number; freq: number } | null {
  const voiced = curve.filter((p) => p.freq) as { t: number; freq: number }[];
  if (voiced.length < 2) return null;
  const center = median(voiced.map((p) => p.freq));
  let best: { start: number; end: number } | null = null;
  let runStart = -1;
  let prevT = -Infinity;
  const close = (p: PitchPoint) => p.freq !== null && Math.abs(centsBetween(p.freq, center)) <= toleranceCents;
  for (let i = 0; i <= curve.length; i++) {
    const p = curve[i];
    // a run continues while the pitch stays near the center (one-frame dropouts are allowed)
    const ok = p && (close(p) || (p.freq === null && i + 1 < curve.length && close(curve[i + 1]) && runStart >= 0));
    if (ok) {
      if (runStart < 0) runStart = i;
      prevT = p.t;
    } else if (runStart >= 0) {
      const seg = { start: curve[runStart].t, end: prevT };
      if (!best || seg.end - seg.start > best.end - best.start) best = seg;
      runStart = -1;
    }
  }
  if (!best || best.end - best.start < minSeconds) return null;
  const inside = voiced.filter((p) => p.t >= best!.start && p.t <= best!.end).map((p) => p.freq);
  return { ...best, freq: median(inside) };
}

/** Copy samples[startSec..endSec] with short fades at both ends (no clicks when played). */
export function trimWithFades(samples: Float32Array, sampleRate: number, startSec: number, endSec: number, fadeSec = 0.02): Float32Array {
  const a = Math.max(0, Math.floor(startSec * sampleRate));
  const b = Math.min(samples.length, Math.ceil(endSec * sampleRate));
  const out = samples.slice(a, b);
  const fade = Math.min(Math.floor(fadeSec * sampleRate), Math.floor(out.length / 2));
  for (let i = 0; i < fade; i++) {
    const g = i / fade;
    out[i] *= g;
    out[out.length - 1 - i] *= g;
  }
  return out;
}
