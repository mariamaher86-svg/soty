// Vocalises ("آه ها ها آآآ"): classic warm-up/technique patterns, played in the user's range starting low,
// going up a semitone each repetition, then back down.

import type { VideoKey } from '../content/videos';

export interface Vocalise {
  id: string;
  ar: string;
  /** what it does, one line */
  what: string;
  /** YouTube search queries (Arabic + English) live in content/videos.ts */
  video: VideoKey;
  degrees: number[]; // semitones above the start note
  syllables: string[]; // one per note
  dur: number; // seconds per note
  gap?: number; // silence after each note (staccato)
}

const rep = (s: string, n: number) => Array.from({ length: n }, () => s);

export const VOCALISES: Vocalise[] = [
  { id: 'five', ar: 'سلم الخمس نغمات "آه"', what: 'بيسخّن الصوت كله بهدوء ويعلّم الانتقال من نغمة لنغمة.', video: 'vocalise-five', degrees: [0, 2, 4, 5, 7, 5, 4, 2, 0], syllables: rep('آه', 9), dur: 0.45 },
  { id: 'arp', ar: 'أربيجيو "ما مي ما"', what: 'بيقفز بين نغمات بعيدة شوية ويوضّح الكلام.', video: 'vocalise-arp', degrees: [0, 4, 7, 4, 0], syllables: ['ما', 'مي', 'ما', 'مي', 'ما'], dur: 0.55 },
  { id: 'staccato', ar: 'ستاكاتو "ها ها ها"', what: 'نغمات قصيرة منفصلة من البطن — بيقوّي سند النفس (الحجاب الحاجز).', video: 'vocalise-staccato', degrees: [0, 4, 7, 4, 0], syllables: rep('ها', 5), dur: 0.25, gap: 0.2 },
  { id: 'nee', ar: '"ني ني ني"', what: 'بيقدّم الصوت لقدّام ويخليه أوضح وأسهل في النغمات العالية.', video: 'vocalise-nee', degrees: [0, 2, 4, 5, 7, 5, 4, 2, 0], syllables: rep('ني', 9), dur: 0.4 },
  { id: 'octave', ar: 'زحلقة أوكتاف "وو"', what: 'بيوصل بين الصوت الواطي والعالي بنعومة.', video: 'vocalise-octave', degrees: [0, 12, 0], syllables: rep('وو', 3), dur: 0.9 },
];

/**
 * More patterns used by the voice course only (not listed on the vocalise pages). Degrees may be quarter tones (.5).
 * YouTube searches for them live in content/videos.ts.
 */
export const COURSE_PATTERNS: Vocalise[] = [
  { id: 'scale8', ar: 'سلم أوكتاف كامل "آه"', what: 'جملة طويلة على نفس واحد: طالعة ٨ نغمات ونازلة.', video: 'doremi', degrees: [0, 2, 4, 5, 7, 9, 11, 12, 11, 9, 7, 5, 4, 2, 0], syllables: rep('آه', 15), dur: 0.45 },
  { id: 'jumps', ar: 'نطّات "يا"', what: 'تنطي من القرار لنغمة بعيدة وترجعي.', video: 'intervals', degrees: [0, 4, 0, 7, 0], syllables: rep('يا', 5), dur: 0.6 },
  { id: 'echo', ar: 'جملة قصيرة "لا"', what: 'جملة صغيرة تسمعيها مرة وتغنيها زيها.', video: 'matchPitch', degrees: [0, 4, 2, 5, 4, 2, 0], syllables: rep('لا', 7), dur: 0.5 },
  { id: 'melisma', ar: 'زخرفة "آه" (رَن)', what: 'نغمات كتير ورا بعض على حرف واحد، زي الآهات في الأغاني.', video: 'melisma', degrees: [0, 2, 4, 2, 4, 5, 4, 2, 0], syllables: rep('آه', 9), dur: 0.35 },
  { id: 'rast-phrase', ar: 'جملة راست', what: 'جملة قصيرة فيها التالتة ربع تون بتاعة راست.', video: 'maqam', degrees: [0, 2, 3.5, 5, 3.5, 2, 0], syllables: rep('آه', 7), dur: 0.55 },
  { id: 'turn', ar: 'دوران حوالين النغمة', what: 'زخرفة عربي: فوق النغمة وتحتها وترجعي لها.', video: 'ornaments', degrees: [2, 3.5, 2, 0, 2], syllables: rep('آه', 5), dur: 0.4 },
  { id: 'bayati-turn', ar: 'زخرفة بياتي', what: 'دوران صغير فيه التانية ¾ بتاعة بياتي.', video: 'ornaments', degrees: [0, 1.5, 3, 1.5, 0], syllables: rep('آه', 5), dur: 0.45 },
];

export interface PatternNote {
  midi: number;
  syllable: string;
  /** seconds from the start of the pattern */
  t: number;
  dur: number;
}

/** The notes of one repetition starting on `startMidi`. */
export function vocaliseNotes(v: Vocalise, startMidi: number): PatternNote[] {
  let t = 0;
  return v.degrees.map((d, i) => {
    const n = { midi: startMidi + d, syllable: v.syllables[i] ?? v.syllables[0], t, dur: v.dur };
    t += v.dur + (v.gap ?? 0);
    return n;
  });
}

export function patternLength(v: Vocalise): number {
  return v.degrees.length * (v.dur + (v.gap ?? 0));
}

/**
 * Start notes for the repetitions: from the bottom of the comfortable range, up a semitone each time while the
 * pattern's top stays inside the range, then back down (the top key isn't repeated).
 */
export function vocaliseKeys(v: Vocalise, low: number, high: number, maxSteps = 6): number[] {
  const top = Math.max(...v.degrees);
  const first = low;
  const last = Math.min(high - top, first + maxSteps);
  if (last < first) return [Math.max(low, high - top)]; // range too small for the pattern: one comfortable key
  const up: number[] = [];
  for (let k = first; k <= last; k++) up.push(k);
  return [...up, ...up.slice(0, -1).reverse()];
}

/** Which note of the pattern should be sounding at time t (seconds), or null between notes / after the end. */
export function noteAt(notes: PatternNote[], t: number): PatternNote | null {
  return notes.find((n) => t >= n.t && t < n.t + n.dur) ?? null;
}
