// Choir parts ("تدريب صوتك في الكورال"): a song can have several part recordings (soprano, alto, tenor, bass…)
// played together; she picks her part and a mode that sets how loud each part is.

import { centsBetween } from './music';
import { median } from './stats';
import { sampleAt, type PitchPoint } from './compare';

export interface SongPart {
  id: string;
  name: string;
  file: { name: string; type: string; size: number };
}

export const PART_PRESETS = ['سوبرانو', 'ألتو', 'تينور', 'باص'];

/** Key of a part's audio in the song-files store (the main reference file uses the plain song id). */
export const partKey = (songId: string, partId: string) => `${songId}::${partId}`;
export const songIdOfKey = (key: string) => key.split('::')[0];

export type ChoirMode = 'mine' | 'mineLoud' | 'withoutMe' | 'fade';

export const CHOIR_MODES: { id: ChoirMode; ar: string; what: string }[] = [
  { id: 'mine', ar: 'اسمعي صوتك لوحده', what: 'صوتك بس — عشان تحفظيه.' },
  { id: 'mineLoud', ar: 'صوتك عالي', what: 'صوتك عالي والباقيين واطيين — تتعودي تسمعيه وسط الكورال.' },
  { id: 'withoutMe', ar: 'الكورال من غيرك', what: 'كل الأصوات إلا صوتك — وإنتي تغنيه.' },
  { id: 'fade', ar: 'صوتك بيختفي تدريجيًا', what: 'كل مرة صوتك بيوطى شوية لحد ما يختفي وتكمّليه لوحدك.' },
];

/** How loud each part is (0..1) in a mode; `repeat` counts loop repeats for the fade. */
export function modeGains(mode: ChoirMode, count: number, mine: number, repeat = 0): number[] {
  return Array.from({ length: count }, (_, i) => {
    const isMine = i === mine;
    if (mode === 'mine') return isMine ? 1 : 0;
    if (mode === 'mineLoud') return isMine ? 1 : 0.25;
    if (mode === 'withoutMe') return isMine ? 0 : 1;
    return isMine ? Math.max(0, Math.round((1 - 0.25 * repeat) * 100) / 100) : 1; // fade: 1, .75, .5, .25, 0
  });
}

/** Final gains with her own volume sliders (0..1) and mute buttons on top of the mode. */
export function mixGains(mode: number[], volumes: number[], muted: boolean[]): number[] {
  return mode.map((g, i) => (muted[i] ? 0 : g * (volumes[i] ?? 1)));
}

/** Keeping parts together: a follower more than `tolerance` seconds away from the leader jumps to it. */
export function syncTarget(leaderT: number, followerT: number, tolerance = 0.04): number | null {
  return Math.abs(leaderT - followerT) > tolerance ? leaderT : null;
}

/**
 * Which octave she sings her part in, relative to the part (e.g. -1 = an octave lower — normal when a man
 * sings a soprano line). The score itself is octave-insensitive.
 */
export function partOctave(sung: PitchPoint[], part: PitchPoint[]): number | null {
  const octs: number[] = [];
  for (const s of sung) {
    if (!s.freq) continue;
    const r = sampleAt(part, s.t);
    if (r?.freq) octs.push(Math.round(centsBetween(s.freq, r.freq) / 1200));
  }
  return octs.length >= 10 ? median(octs) : null;
}
