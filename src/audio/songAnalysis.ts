// A song's pitch curve, analysed once and kept: decoding a whole song needs a lot of memory for a moment (a 5-minute
// stereo file is 115 MB at the phone's sample rate), so it must not happen on every open.
// - cached in IndexedDB as one small typed array, so reopening never decodes;
// - decoded at 22 kHz through an offline context (half the memory, same notes, and it doesn't touch the live audio);
// - mixed to mono in place (no second copy); only one analysis per file runs at a time.

import { run } from './db';
import { packCurve, unpackCurve, type PackedCurve } from '../lib/curveCap';
import { extractPitchCurve, monoInPlace } from '../lib/pitchTrack';
import type { PitchPoint } from '../lib/compare';

export interface SongAnalysis {
  curve: PitchPoint[];
  duration: number;
}

const ANALYSIS_RATE = 22050;
const running = new Map<string, Promise<SongAnalysis>>();

/** True while a song is being decoded/analysed (sync waits: the memory is needed here). */
export const analysisRunning = () => running.size > 0;

/** Cache key: the song/part key plus size and name, so a replaced file is analysed again. */
export const curveKey = (id: string, size: number, name: string) => `${id}|${size}|${name}`;

async function decodeLight(bytes: ArrayBuffer): Promise<AudioBuffer> {
  const copy = bytes.slice(0); // decodeAudioData empties what it's given, and a failed attempt must leave a copy to retry
  try {
    return await new OfflineAudioContext(1, 1, ANALYSIS_RATE).decodeAudioData(copy);
  } catch {
    return await new OfflineAudioContext(1, 1, 44100).decodeAudioData(bytes);
  }
}

/** The curve of a song file: from the cache, or decoded once and cached. `load` is only called if it's needed. */
export function analyzeSong(key: string, load: () => Promise<ArrayBuffer>, onProgress?: (p: number) => void): Promise<SongAnalysis> {
  const inFlight = running.get(key);
  if (inFlight) return inFlight;
  const job = (async () => {
    const cached = await run<{ key: string; packed: PackedCurve; duration: number } | undefined>('curves', 'readonly', (s) => s.get(key)).catch(() => undefined);
    if (cached) return { curve: unpackCurve(cached.packed), duration: cached.duration };
    const buffer = await decodeLight(await load());
    const window = buffer.sampleRate < 30000 ? 1024 : 2048;
    const curve = await extractPitchCurve(monoInPlace(buffer), buffer.sampleRate, { windowSize: window }, onProgress);
    const duration = buffer.duration;
    await run('curves', 'readwrite', (s) => s.put({ key, packed: packCurve(curve), duration })).catch(() => undefined); // no cache is fine
    return { curve, duration };
  })().finally(() => running.delete(key));
  running.set(key, job);
  return job;
}

/** Forget a song's cached curves when its file is removed. */
export function forgetCurves(id: string): Promise<unknown> {
  return run('curves', 'readwrite', (s) => s.delete(IDBKeyRange.bound(`${id}|`, `${id}|￿`))).catch(() => undefined);
}

/** Really let go of a media element: stops it, frees its decoder, and releases the file it was holding. */
export function releaseAudio(el: HTMLAudioElement | null | undefined) {
  if (!el) return;
  try {
    el.pause();
    const src = el.src;
    el.onended = null;
    el.removeAttribute('src');
    el.load();
    if (src.startsWith('blob:')) URL.revokeObjectURL(src);
  } catch {
    // already gone
  }
}
