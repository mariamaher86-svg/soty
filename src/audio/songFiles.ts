// Song library audio files in IndexedDB (so she doesn't pick the file again every time). Never throws.

import { isQuotaError, run } from './db';

export interface StoredSongFile {
  songId: string;
  name: string;
  type: string;
  bytes: ArrayBuffer;
}

export type SaveFileResult = { ok: true } | { ok: false; error: string };

export async function saveSongFile(f: StoredSongFile): Promise<SaveFileResult> {
  try {
    await run('songFiles', 'readwrite', (s) => s.put(f));
    return { ok: true };
  } catch (e) {
    if (isQuotaError(e)) return { ok: false, error: 'المساحة المتاحة للتطبيق على الجهاز ده خلصت. امسحي ملف صوت أغنية تانية (أو استخدمي لينك يوتيوب بدل الملف) وجربي تاني.' };
    return { ok: false, error: 'معرفناش نحفظ الملف في المتصفح ده (ممكن يكون وضع التصفح الخاص).' };
  }
}

export async function getSongFile(songId: string): Promise<StoredSongFile | null> {
  try {
    return (await run<StoredSongFile | undefined>('songFiles', 'readonly', (s) => s.get(songId))) ?? null;
  } catch {
    return null;
  }
}

export async function deleteSongFile(songId: string): Promise<void> {
  try {
    await run('songFiles', 'readwrite', (s) => s.delete(songId));
  } catch {
    // ignore
  }
}

export async function listSongFiles(): Promise<StoredSongFile[]> {
  try {
    return await run<StoredSongFile[]>('songFiles', 'readonly', (s) => s.getAll());
  } catch {
    return [];
  }
}

export async function clearSongFiles(): Promise<void> {
  try {
    await run('songFiles', 'readwrite', (s) => s.clear());
  } catch {
    // ignore
  }
}

/** Space used / available for this site, if the browser tells us. */
export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    return e && e.usage !== undefined && e.quota !== undefined ? { usage: e.usage, quota: e.quota } : null;
  } catch {
    return null;
  }
}

export const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} ميجا`;
