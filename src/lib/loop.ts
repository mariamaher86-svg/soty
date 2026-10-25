// "كرري الحتة دي": looping a hard phrase. Pure window/timeline/scoring helpers.

import { compareCurves, type PitchPoint } from './compare';

export interface LoopWindow {
  start: number; // seconds, in the track's own (media) time
  end: number;
}

export const LOOP_PAD = 1;
export const MIN_LOOP = 0.5;

/** A loop around a moment, padded on both sides and kept inside the track. */
export function loopWindow(start: number, end: number, duration: number, pad = LOOP_PAD): LoopWindow {
  let s = Math.max(0, Math.min(start, end) - pad);
  let e = Math.min(duration, Math.max(start, end) + pad);
  if (e - s < MIN_LOOP) {
    e = Math.min(duration, s + MIN_LOOP);
    s = Math.max(0, e - MIN_LOOP);
  }
  return { start: s, end: e };
}

/** Moves the start or the end by `delta` seconds, staying inside the track and at least MIN_LOOP long. */
export function nudge(w: LoopWindow, which: 'start' | 'end', delta: number, duration: number): LoopWindow {
  if (which === 'start') return { ...w, start: Math.max(0, Math.min(w.start + delta, w.end - MIN_LOOP)) };
  return { ...w, end: Math.min(duration, Math.max(w.end + delta, w.start + MIN_LOOP)) };
}

/** Sets the start or the end at the current playing position (the "بداية هنا / نهاية هنا" buttons). */
export function markAt(w: LoopWindow, which: 'start' | 'end', t: number, duration: number): LoopWindow {
  const x = Math.max(0, Math.min(duration, t));
  if (which === 'start') return { start: x, end: Math.max(w.end, Math.min(duration, x + MIN_LOOP)) };
  return { start: Math.min(w.start, Math.max(0, x - MIN_LOOP)), end: Math.max(x, Math.min(duration, w.start + MIN_LOOP)) };
}

/**
 * At a slower speed the track's own clock (media currentTime) runs slower than real time. Her voice is
 * stamped with the media clock, so the reference curve (also in media time) lines up by itself; only the
 * fixed real-world delay of the mic must be converted: 0.1 s of real time = 0.1 × rate of media time.
 */
export function mediaLatency(latencySeconds: number, rate: number): number {
  return latencySeconds * rate;
}

/** How long one repeat takes in real time at a speed (for the progress bar / gaps). */
export function realDuration(w: LoopWindow, rate: number): number {
  return (w.end - w.start) / rate;
}

/** Reference curve converted to real (wall-clock) time from the loop start, e.g. to draw it at slow speed. */
export function toRealTime(points: PitchPoint[], w: LoopWindow, rate: number): PitchPoint[] {
  return points.filter((p) => p.t >= w.start && p.t <= w.end).map((p) => ({ t: (p.t - w.start) / rate, freq: p.freq }));
}

/** Score of one repeat against the reference phrase (file mode): only the loop window counts. */
export function scoreRepeat(sung: PitchPoint[], reference: PitchPoint[], w: LoopWindow): number {
  const inside = (p: PitchPoint) => p.t >= w.start && p.t <= w.end;
  return compareCurves(sung.filter(inside), reference.filter(inside)).score;
}

/** "52% ← 68% ← 81%" (RTL arrows) and whether it is getting better. */
export function trend(scores: number[]): { text: string; better: boolean | null } {
  if (!scores.length) return { text: '', better: null };
  const text = scores.map((s) => `${s}%`).join(' ← ');
  if (scores.length < 2) return { text, better: null };
  const firstHalf = scores.slice(0, Math.ceil(scores.length / 2));
  const lastHalf = scores.slice(Math.floor(scores.length / 2));
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  return { text, better: avg(lastHalf) > avg(firstHalf) + 2 };
}
