// Teacher voice recordings, saved in this browser (IndexedDB). Failures never throw.

import { run as runDb } from './db';

export interface TeacherNote {
  id?: number;
  /** Measured pitch of the steady part, Hz. */
  freq: number;
  sampleRate: number;
  /** Mono PCM of the trimmed steady part. */
  data: Float32Array;
  createdAt: number;
  /** the note it was recorded for (checked within ±30 cents) */
  target?: number;
  /** "دو ري مي" mode: the syllable sung */
  syllable?: string;
}

const run = <T,>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest) => runDb<T>('teacher', mode, fn);

let listeners: (() => void)[] = [];
const changed = () => listeners.forEach((l) => l());

/** Called whenever recordings are added or deleted. Returns an unsubscribe function. */
export function onTeacherChange(l: () => void) {
  listeners.push(l);
  return () => {
    listeners = listeners.filter((x) => x !== l);
  };
}

export async function listTeacher(): Promise<TeacherNote[]> {
  try {
    const all = await run<TeacherNote[]>('readonly', (s) => s.getAll());
    return all.sort((a, b) => a.freq - b.freq);
  } catch {
    return [];
  }
}

export async function saveTeacher(note: TeacherNote): Promise<boolean> {
  try {
    await run('readwrite', (s) => s.add(note));
    changed();
    return true;
  } catch {
    return false;
  }
}

export async function deleteTeacher(id: number): Promise<void> {
  try {
    await run('readwrite', (s) => s.delete(id));
  } catch {
    // ignore
  }
  changed();
}

/** Removes every teacher recording (before restoring a backup in "replace" mode). */
export async function clearTeacher(): Promise<void> {
  try {
    await run('readwrite', (s) => s.clear());
  } catch {
    // ignore
  }
  changed();
}
