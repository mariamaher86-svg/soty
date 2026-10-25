// Checking teacher recordings before they're saved: the steady part must be within ±30 cents of the
// target note. Also the "دو ري مي" syllable set (each syllable recorded on its own note).

import { centsBetween, midiToFreq } from './music';
import { median, stabilityCents } from './stats';
import { steadySegment } from './samples';
import type { PitchPoint } from './compare';

export const TEACHER_TOLERANCE = 30;
export const MIN_STEADY_SECONDS = 0.6;

export type TakeCheck = { ok: true; cents: number } | { ok: false; reason: 'unsteady' } | { ok: false; reason: 'octave' | 'off'; cents: number };

/** Is this take good enough to save for this target note? */
export function checkTake(seg: { freq: number; start: number; end: number } | null, targetMidi: number): TakeCheck {
  if (!seg || seg.end - seg.start < MIN_STEADY_SECONDS) return { ok: false, reason: 'unsteady' };
  const cents = Math.round(centsBetween(seg.freq, midiToFreq(targetMidi)));
  if (Math.abs(cents) <= TEACHER_TOLERANCE) return { ok: true, cents };
  if (Math.abs(Math.abs(cents) - 1200) <= 60) return { ok: false, reason: 'octave', cents };
  return { ok: false, reason: 'off', cents };
}

/** Plain words for a take check (neutral wording: the teacher may be anyone). */
export function takeMessage(c: TakeCheck): string {
  if (c.ok) return `مظبوطة ✔ (${c.cents > 0 ? '+' : ''}${c.cents} سنت) — اتحفظت.`;
  if (c.reason === 'unsteady') return 'مفيش نغمة ثابتة كفاية (محتاجين حوالي ثانية ثابتة على الأقل). المطلوب نغمة واحدة ممدودة من غير تغيير — ومحاولة تانية.';
  if (c.reason === 'octave') return `التسجيل ${c.cents < 0 ? 'أوطى' : 'أعلى'} بأوكتاف من النغمة المطلوبة. المطلوب نفس طبقة نغمة البيانو — ماتحفظش، ومحاولة تانية.`;
  return `التسجيل ${c.cents > 0 ? 'أعلى' : 'أوطى'} من النغمة بـ ${Math.abs(c.cents)} سنت (المسموح ±${TEACHER_TOLERANCE}). ماتحفظش — سماع نغمة البيانو تاني ومحاولة تانية.`;
}

/** Re-checking a saved recording: how far from the nearest note, and how steady. */
export function assessRecording(curve: PitchPoint[], targetMidi?: number): { freq: number | null; cents: number | null; steadiness: number | null; ok: boolean } {
  const voiced = curve.filter((p) => p.freq).map((p) => p.freq as number);
  const seg = steadySegment(curve, 40, 0.3);
  if (!voiced.length || !seg) return { freq: null, cents: null, steadiness: null, ok: false };
  const freq = median(voiced);
  const ref = targetMidi !== undefined ? targetMidi : Math.round(69 + 12 * Math.log2(freq / 440));
  const cents = Math.round(centsBetween(freq, midiToFreq(ref)));
  const steadiness = Math.round(stabilityCents(voiced));
  return { freq, cents, steadiness, ok: Math.abs(cents) <= TEACHER_TOLERANCE && steadiness <= 25 };
}

// ---- "دو ري مي" syllables

export const SOLFEGE: { syl: string; ar: string; pc: number }[] = [
  { syl: 'do', ar: 'دو', pc: 0 },
  { syl: 're', ar: 'ري', pc: 2 },
  { syl: 'mi', ar: 'مي', pc: 4 },
  { syl: 'fa', ar: 'فا', pc: 5 },
  { syl: 'sol', ar: 'صول', pc: 7 },
  { syl: 'la', ar: 'لا', pc: 9 },
  { syl: 'si', ar: 'سي', pc: 11 },
];

/** The 7 notes to record (do..si going up), inside the user's range where possible. */
export function syllableTargets(low: number, high: number): { syl: string; ar: string; midi: number }[] {
  // a "do" so that do..si (11 semitones) fits, as close to the middle as possible
  let doMidi = 60;
  while (doMidi + 11 > high && doMidi - 12 >= low - 2) doMidi -= 12;
  while (doMidi < low - 2) doMidi += 12;
  return SOLFEGE.map((s) => ({ syl: s.syl, ar: s.ar, midi: doMidi + s.pc }));
}

/** The syllable a note is named with: C→do … B→si; a sharp is named after the natural just below (C#→do). */
export function syllableFor(midi: number): string {
  const pc = ((Math.round(midi) % 12) + 12) % 12;
  let best = SOLFEGE[0];
  for (const s of SOLFEGE) if (s.pc <= pc) best = s;
  return best.syl;
}
