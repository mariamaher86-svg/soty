// Voice type (taba2a) classification from a sung range, default ranges by gender, octave helpers.

import type { Gender } from './gender';

export type VoiceType = 'bass' | 'baritone' | 'tenor' | 'alto' | 'mezzo' | 'soprano';

/** Typical ranges in MIDI numbers (low, high). */
export const VOICE_TYPES: { id: VoiceType; ar: string; en: string; low: number; high: number; gender: Gender }[] = [
  { id: 'bass', ar: 'باص', en: 'Bass', low: 40, high: 64, gender: 'm' }, // E2–E4
  { id: 'baritone', ar: 'باريتون', en: 'Baritone', low: 45, high: 69, gender: 'm' }, // A2–A4
  { id: 'tenor', ar: 'تينور', en: 'Tenor', low: 48, high: 72, gender: 'm' }, // C3–C5
  { id: 'alto', ar: 'كونترالتو (ألتو)', en: 'Contralto', low: 53, high: 77, gender: 'f' }, // F3–F5
  { id: 'mezzo', ar: 'ميتزو سوبرانو', en: 'Mezzo-soprano', low: 57, high: 81, gender: 'f' }, // A3–A5
  { id: 'soprano', ar: 'سوبرانو', en: 'Soprano', low: 60, high: 84, gender: 'f' }, // C4–C6
];

/**
 * Voice types ordered from closest to the sung range to farthest (lower score = closer).
 * The low note counts more: high notes grow a lot with training, the bottom of the voice much less.
 */
export function rankVoiceTypes(low: number, high: number, gender?: Gender) {
  const center = (low + high) / 2;
  return VOICE_TYPES.filter((v) => !gender || v.gender === gender).map((v) => ({
    ...v,
    score: 1.5 * Math.abs(low - v.low) + Math.abs(high - v.high) + 0.01 * Math.abs(center - (v.low + v.high) / 2),
  })).sort((a, b) => a.score - b.score);
}

/** The closest voice type to the sung range. */
export function classifyVoice(low: number, high: number, gender?: Gender) {
  return rankVoiceTypes(low, high, gender)[0];
}

/** Closest type plus a runner-up when it is nearly as close (short ranges are often ambiguous). */
export function voiceTypeGuess(low: number, high: number, gender?: Gender) {
  const [best, second] = rankVoiceTypes(low, high, gender);
  return { best, alt: second.score - best.score <= 3 ? second : undefined };
}

/** Notes comfortable for exercises: the sung range minus a small margin at both ends. */
export function comfortableRange(low: number, high: number): { low: number; high: number } {
  const margin = high - low >= 10 ? 2 : 0;
  return { low: Math.round(low + margin), high: Math.round(high - margin) };
}

/** Comfortable ranges used until a range test is done: female ≈ F3–C5, male ≈ A2–E4 (an octave-ish lower). */
export const DEFAULT_RANGES: Record<Gender, { low: number; high: number }> = {
  f: { low: 53, high: 72 },
  m: { low: 45, high: 64 },
};
export const DEFAULT_RANGE = DEFAULT_RANGES.f;

export function defaultRange(gender: Gender): { low: number; high: number } {
  return { ...DEFAULT_RANGES[gender] };
}

/** A note moved by whole octaves into [low, high] (or as close to its middle as possible): reference notes in the user's own octave. */
export function inUserOctave(midi: number, low: number, high: number): number {
  const center = (low + high) / 2;
  let m = midi;
  while (m > high) m -= 12;
  while (m < low) m += 12;
  if (m > high) m = Math.abs(m - center) <= Math.abs(m - 12 - center) ? m : m - 12; // range smaller than an octave
  return m;
}

/**
 * "You're singing an octave lower/higher": most recent voiced readings (raw cents from the target, not wrapped)
 * sit about ±1200 cents away. Returns null when there aren't enough readings or it's just off-key.
 */
export function octaveHint(rawCents: number[], minReadings = 10): 'below' | 'above' | null {
  if (rawCents.length < minReadings) return null;
  const near = (c: number, t: number) => Math.abs(c - t) <= 80;
  const below = rawCents.filter((c) => near(c, -1200)).length / rawCents.length;
  const above = rawCents.filter((c) => near(c, 1200)).length / rawCents.length;
  if (below >= 0.7) return 'below';
  if (above >= 0.7) return 'above';
  return null;
}
