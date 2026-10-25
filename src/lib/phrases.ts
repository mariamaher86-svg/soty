// "تعلّمي الأغنية جملة جملة": split a reference pitch curve into phrases (by silences) and each phrase into
// a note sequence (quarter tones kept) that can be played slowly on the piano.

import type { PitchPoint } from './compare';
import { freqToMidi } from './music';
import { median } from './stats';

export interface Phrase {
  start: number;
  end: number;
}

/** Phrases = voiced stretches separated by at least `minGap` seconds of silence; very short ones are merged. */
export function splitPhrases(curve: PitchPoint[], minGap = 0.4, minLen = 0.8): Phrase[] {
  const voiced = curve.filter((p) => p.freq);
  if (!voiced.length) return [];
  const out: Phrase[] = [];
  let cur: Phrase = { start: voiced[0].t, end: voiced[0].t };
  for (let i = 1; i < voiced.length; i++) {
    const p = voiced[i];
    if (p.t - cur.end >= minGap) {
      out.push(cur);
      cur = { start: p.t, end: p.t };
    } else cur.end = p.t;
  }
  out.push(cur);
  // merge phrases shorter than minLen into a neighbour
  const merged: Phrase[] = [];
  for (const ph of out) {
    const last = merged[merged.length - 1];
    if (last && (ph.end - ph.start < minLen || last.end - last.start < minLen)) last.end = ph.end;
    else merged.push({ ...ph });
  }
  return merged;
}

/** Moves a phrase edge (manual adjust), keeping it inside [0, duration] and at least 0.3 s long. */
export function adjustPhrase(ph: Phrase, which: 'start' | 'end', delta: number, duration: number): Phrase {
  if (which === 'start') return { ...ph, start: Math.max(0, Math.min(ph.start + delta, ph.end - 0.3)) };
  return { ...ph, end: Math.min(duration, Math.max(ph.end + delta, ph.start + 0.3)) };
}

export interface PhraseNote {
  /** fractional MIDI, steps of 0.5 (quarter tones kept) */
  midi: number;
  start: number;
  dur: number;
}

/**
 * The phrase's notes: steady stretches of pitch (rounded to the nearest quarter tone) lasting at least `minDur`;
 * consecutive equal notes are joined, slides and blips are dropped.
 */
export function phraseNotes(curve: PitchPoint[], ph: Phrase, minDur = 0.12): PhraseNote[] {
  const pts = curve.filter((p) => p.t >= ph.start && p.t <= ph.end);
  const runs: { midi: number; start: number; end: number; values: number[] }[] = [];
  for (const p of pts) {
    if (!p.freq) continue;
    const m = freqToMidi(p.freq);
    const q = Math.round(m * 2) / 2;
    const last = runs[runs.length - 1];
    if (last && Math.abs(q - last.midi) < 0.01 && p.t - last.end < 0.12) {
      last.end = p.t;
      last.values.push(m);
    } else runs.push({ midi: q, start: p.t, end: p.t, values: [m] });
  }
  const notes: PhraseNote[] = [];
  for (const r of runs) {
    if (r.end - r.start < minDur) continue;
    const midi = Math.round(median(r.values) * 2) / 2;
    const prev = notes[notes.length - 1];
    if (prev && prev.midi === midi && r.start - (prev.start + prev.dur) < 0.15) prev.dur = r.end - prev.start;
    else notes.push({ midi, start: r.start, dur: r.end - r.start });
  }
  return notes;
}
