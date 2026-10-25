// Rhythm ("الإيقاع"): metronome scheduling, clap/"تا" onset detection from mic loudness, latency calibration
// (iOS adds input + output delay), and timing scores.

import { median } from './stats';

export const beatSeconds = (bpm: number) => 60 / bpm;

export interface ScheduledBeat {
  time: number; // AudioContext seconds
  index: number; // beat number from the start
  accent: boolean; // first beat of the bar
}

/**
 * Metronome lookahead scheduling: every beat whose time falls before now + lookahead, starting at nextTime.
 * Returns the beats to schedule and where to continue.
 */
export function scheduleBeats(nextTime: number, nextIndex: number, now: number, lookahead: number, bpm: number, beatsPerBar: number): { beats: ScheduledBeat[]; nextTime: number; nextIndex: number } {
  const beats: ScheduledBeat[] = [];
  let t = nextTime;
  let i = nextIndex;
  while (t < now + lookahead) {
    beats.push({ time: t, index: i, accent: i % beatsPerBar === 0 });
    t += beatSeconds(bpm);
    i++;
  }
  return { beats, nextTime: t, nextIndex: i };
}

/** Rhythm patterns for one 4-beat bar, in beats from the bar start (rests = missing beats). */
export const RHYTHM_PATTERNS: { id: string; ar: string; symbols: string; beats: number[] }[] = [
  { id: 'quarters', ar: 'أربع ضربات', symbols: '♩ ♩ ♩ ♩', beats: [0, 1, 2, 3] },
  { id: 'rest', ar: 'ضربة وسكتة', symbols: '♩ ♩ 𝄽 ♩', beats: [0, 1, 3] },
  { id: 'eighths', ar: 'ضربتين في كل عدّة', symbols: '♫ ♫ ♫ ♫', beats: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5] },
  { id: 'mixed', ar: 'خليط', symbols: '♩ ♫ ♩ 𝄽', beats: [0, 1, 1.5, 2] },
];

/** Times (seconds) of a pattern repeated for `bars` bars, starting at `start`. */
export function patternTimes(beats: number[], start: number, bpm: number, bars = 2, beatsPerBar = 4): number[] {
  const out: number[] = [];
  for (let b = 0; b < bars; b++) for (const x of beats) out.push(start + (b * beatsPerBar + x) * beatSeconds(bpm));
  return out;
}

/** A loudness threshold for claps from a recording: well above its quiet part. */
export function onsetThreshold(rms: number[]): number {
  if (!rms.length) return 0.05;
  const quiet = [...rms].sort((a, b) => a - b).slice(0, Math.max(1, Math.floor(rms.length * 0.3)));
  return Math.max(0.03, median(quiet) * 4);
}

/** Onsets = the moments loudness jumps over the threshold after being low; at most one per `minGap` s. */
export function detectOnsets(frames: { t: number; rms: number }[], threshold: number, minGap = 0.12): number[] {
  const out: number[] = [];
  let armed = true;
  for (const f of frames) {
    if (armed && f.rms > threshold && (!out.length || f.t - out[out.length - 1] >= minGap)) {
      out.push(f.t);
      armed = false;
    } else if (f.rms < threshold * 0.6) armed = true;
  }
  return out;
}

/** Nearest expected time to t (sorted list), or null if none within `window`. */
function nearest(list: number[], t: number, window: number): number | null {
  let best: number | null = null;
  for (const x of list) if (Math.abs(x - t) <= window && (best === null || Math.abs(x - t) < Math.abs(best - t))) best = x;
  return best;
}

/** Latency calibration: the median delay between her claps and the clicks she clapped with. */
export function calibrateLatency(onsets: number[], clicks: number[], window = 0.35): { offset: number; count: number } | null {
  const d: number[] = [];
  for (const o of onsets) {
    const c = nearest(clicks, o, window);
    if (c !== null) d.push(o - c);
  }
  if (d.length < 4) return null; // not enough claps to trust
  return { offset: median(d), count: d.length };
}

export interface Timing {
  /** per expected beat: seconds early (<0) / late (>0), or null if missed */
  errors: (number | null)[];
  score: number; // 0..100
}

/** Matches her (latency-corrected) onsets to the expected beats. ±40 ms = perfect, 250 ms off = 0. */
export function timingScore(onsets: number[], expected: number[], latency = 0, window = 0.3): Timing {
  const corrected = onsets.map((o) => o - latency);
  const used = new Set<number>();
  const errors = expected.map((e) => {
    let best: number | null = null;
    corrected.forEach((o, i) => {
      if (used.has(i) || Math.abs(o - e) > window) return;
      if (best === null || Math.abs(o - e) < Math.abs(corrected[best] - e)) best = i;
    });
    if (best === null) return null;
    used.add(best);
    return corrected[best] - e;
  });
  const points = errors.map((err) => (err === null ? 0 : Math.max(0, Math.min(1, (0.25 - Math.abs(err)) / (0.25 - 0.04)))));
  const extra = corrected.length - used.size; // claps where there's no beat count against her
  const raw = points.length ? (points.reduce((a, b) => a + b, 0) / (points.length + extra * 0.5)) * 100 : 0;
  return { errors, score: Math.round(raw) };
}

const arNum = (x: number) => x.toFixed(1).replace('.', '٫').replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);

/** "دخلتي بدري ٠٫٢ ثانية" / "متأخرة ٠٫١ ثانية" / "مظبوط" (feminine source; masculine via the wording system). */
export function timingWords(err: number | null): string {
  if (err === null) return 'مفيش ضربة';
  if (Math.abs(err) <= 0.04) return 'مظبوط ✔';
  return err < 0 ? `دخلتي بدري ${arNum(-err)} ثانية` : `دخلتي متأخر ${arNum(err)} ثانية`;
}
