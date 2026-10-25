// Small pure helpers for judging singing: stability, holding a note, durations, guidance text.

import { centsBetween, freqToMidi } from './music';

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

export function stdDev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Pitch steadiness: standard deviation in cents around the median pitch. */
export function stabilityCents(freqs: number[]): number {
  if (freqs.length < 2) return 0;
  const ref = median(freqs);
  return stdDev(freqs.map((f) => centsBetween(f, ref)));
}

export function stabilityRating(sd: number): { ar: string; stars: number } {
  if (sd < 10) return { ar: 'ثابت جدًا — ممتاز', stars: 4 };
  if (sd < 20) return { ar: 'ثابت — كويس جدًا', stars: 3 };
  if (sd < 35) return { ar: 'مقبول — محتاج شوية تمرين', stars: 2 };
  return { ar: 'بيتهز — كملي تمرين', stars: 1 };
}

/** Plain-Arabic guidance for a cents deviation. */
export function guidance(cents: number, tolerance = 20): { ar: string; ok: boolean } {
  const c = Math.round(cents);
  const sign = c > 0 ? '+' : '';
  if (Math.abs(c) <= tolerance) return { ar: `${sign}${c} سنت — مظبوط!`, ok: true };
  if (c > 100) return { ar: `${sign}${c} سنت — أعلى بكتير، انزلي`, ok: false };
  if (c < -100) return { ar: `${c} سنت — أوطى بكتير، اطلعي`, ok: false };
  if (c > 0) return { ar: `${sign}${c} سنت — انزلي شوية`, ok: false };
  return { ar: `${c} سنت — اطلعي شوية`, ok: false };
}

/**
 * Tracks "held within ±tolerance cents for holdMs". Feed it one reading per frame.
 * Short dropouts (gapMs) are forgiven so a tiny glitch doesn't reset progress.
 */
export class HoldTracker {
  private heldMs = 0;
  private gap = 0;
  constructor(
    private tolerance = 20,
    private holdMs = 1000,
    private gapMs = 150,
  ) {}

  /** cents = deviation from the target (null = no pitch). Returns progress 0..1. */
  update(cents: number | null, dtMs: number): number {
    if (cents !== null && Math.abs(cents) <= this.tolerance) {
      this.heldMs += dtMs;
      this.gap = 0;
    } else {
      this.gap += dtMs;
      if (this.gap > this.gapMs) this.heldMs = 0;
    }
    return this.progress;
  }

  get progress(): number {
    return Math.min(1, this.heldMs / this.holdMs);
  }

  get done(): boolean {
    return this.heldMs >= this.holdMs;
  }

  reset() {
    this.heldMs = 0;
    this.gap = 0;
  }
}

/**
 * Detects a steady note: when the last `windowMs` of readings are all voiced and
 * stay within `spreadSemitones`, returns their median as a (fractional) MIDI note.
 */
export class SteadyNoteDetector {
  private frames: { t: number; midi: number | null }[] = [];
  constructor(
    private windowMs = 700,
    private spreadSemitones = 0.6,
  ) {}

  update(tMs: number, freq: number | null): number | null {
    this.frames.push({ t: tMs, midi: freq ? freqToMidi(freq) : null });
    while (this.frames.length && this.frames[0].t < tMs - this.windowMs) this.frames.shift();
    if (!this.frames.length || tMs - this.frames[0].t < this.windowMs * 0.9) return null;
    const midis = this.frames.map((f) => f.midi);
    if (midis.some((m) => m === null)) return null;
    const ms = midis as number[];
    if (Math.max(...ms) - Math.min(...ms) > this.spreadSemitones) return null;
    return median(ms);
  }
}

/**
 * Times one continuous sound (a held note or a hiss): starts when `active` becomes true,
 * ends after it stays false for more than `releaseMs`. Durations in ms.
 */
export class SoundTimer {
  private start: number | null = null;
  private lastActive = 0;
  finished = false;
  constructor(private releaseMs = 350) {}

  update(tMs: number, active: boolean): number {
    if (this.finished) return this.duration;
    if (active) {
      if (this.start === null) this.start = tMs;
      this.lastActive = tMs;
    } else if (this.start !== null && tMs - this.lastActive > this.releaseMs) {
      this.finished = true;
    }
    return this.duration;
  }

  get started(): boolean {
    return this.start !== null;
  }

  get duration(): number {
    return this.start === null ? 0 : this.lastActive - this.start;
  }
}

/** Loudness threshold for "is she making sound" from a measured quiet noise floor (RMS). */
export function loudnessThreshold(noiseFloorRms: number): number {
  return Math.max(0.01, noiseFloorRms * 3);
}

/** Percentage 0..100, rounded. */
export function percent(part: number, total: number): number {
  return total ? Math.round((part / total) * 100) : 0;
}
