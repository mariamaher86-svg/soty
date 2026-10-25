// Opening the sing-along from a library song (everything filled in).

import { getPref, setPref } from '../lib/storage';
import type { Song } from '../lib/songs';

/** Default mode for a song: its audio file if stored, else YouTube. */
export function defaultMode(song: Song): 'file' | 'youtube' {
  return song.file ? 'file' : 'youtube';
}

export function singSong(song: Song, mode: 'file' | 'youtube' = defaultMode(song), loop?: { start: number; end: number }) {
  setPref('sing.song', song.id);
  setPref('sing.mode', mode);
  if (song.tonic !== undefined) setPref('yt.tonic', String(song.tonic));
  if (song.scaleId) setPref('yt.scale', song.scaleId);
  setPref('sing.loop', loop ? JSON.stringify(loop) : '');
  window.location.hash = '#/sing';
}

export const getWeeklySong = () => getPref('path.weeklySong') || null;
export const setWeeklySong = (id: string) => setPref('path.weeklySong', id);
