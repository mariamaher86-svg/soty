// Warm-up ("الإحماء"): siren target curve and how closely she followed it.

import { octaveInsensitiveCents, type PitchPoint } from './compare';
import { g } from './gender';
import { midiToFreq } from './music';
import { median } from './stats';

export const SIREN_SECONDS = 60;
export const SIREN_PERIOD = 20; // one slow glide up and down

/**
 * Target pitch (fractional MIDI) at time t: a smooth up-and-down glide around the middle of the range,
 * starting narrow (middle) and widening slowly to most of the comfortable range.
 */
export function sirenTarget(t: number, mid: { low: number; high: number }, wide: { low: number; high: number }, duration = SIREN_SECONDS, period = SIREN_PERIOD): number {
  const center = (mid.low + mid.high) / 2;
  const narrow = (mid.high - mid.low) / 2;
  const broad = Math.max(narrow, Math.min(center - wide.low, wide.high - center));
  const x = Math.max(0, Math.min(1, t / duration));
  const grow = x * x * (3 - 2 * x); // smoothstep: amplitude widens gently
  const amp = narrow + (broad - narrow) * grow;
  return center + amp * Math.sin((2 * Math.PI * t) / period);
}

/** Average |cents| off the target (octave-insensitive) while she was making sound, and how much she sang. */
export function sirenFollow(sung: PitchPoint[], target: (t: number) => number): { avgCents: number | null; voicedShare: number } {
  if (!sung.length) return { avgCents: null, voicedShare: 0 };
  const offs = sung.filter((p) => p.freq).map((p) => Math.abs(octaveInsensitiveCents(p.freq!, midiToFreq(target(p.t)))));
  return { avgCents: offs.length ? Math.round(offs.reduce((a, b) => a + b, 0) / offs.length) : null, voicedShare: offs.length / sung.length };
}

/** Gentle words for the siren result. */
export function sirenWords(avgCents: number | null): string {
  if (avgCents === null) return 'مسمعناش صوت — مفيش مشكلة، جربي تاني بهدوء.';
  if (avgCents <= 50) return 'متابعة ممتازة 👏';
  if (avgCents <= 100) return g('كويس جدًا — قريبة من الخط', 'كويس جدًا — قريب من الخط');
  if (avgCents <= 200) return 'بتقربي — كملي براحة';
  return 'ولا يهمك، الإحماء مش امتحان. المهم الصوت يبقى مريح.';
}

/** Hum notes: 3–5 notes going up by semitones from the low part of the middle range. */
export function humNotes(mid: { low: number; high: number }, count = 5): number[] {
  const n = Math.max(3, Math.min(count, mid.high - mid.low + 1));
  return Array.from({ length: n }, (_, i) => mid.low + i);
}

/** Lip trill: seconds she kept the sound going (loudness above the threshold), from loudness frames. */
export function soundingSeconds(frames: { t: number; rms: number }[], threshold: number): number {
  let total = 0;
  for (let i = 1; i < frames.length; i++) {
    const dt = frames[i].t - frames[i - 1].t;
    if (dt > 0 && dt < 0.2 && frames[i].rms > threshold) total += dt;
  }
  return total;
}

/** A loudness threshold from the quietest part of a recording (room noise). */
export function noiseThreshold(rmsValues: number[], roomRms: number | null = null): number {
  if (!rmsValues.length) return roomRms !== null ? Math.max(0.015, roomRms * 3) : 0.02;
  const quiet = [...rmsValues].sort((a, b) => a - b).slice(0, Math.max(1, Math.floor(rmsValues.length * 0.1)));
  // the measured room (noise check) can only raise the bar, never lower it below the quietest part of this take
  return Math.max(0.015, median(quiet) * 3, roomRms !== null ? roomRms * 3 : 0);
}
