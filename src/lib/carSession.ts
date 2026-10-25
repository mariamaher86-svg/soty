// Car mode ("وضع العربية"): a long, audio-only, hands-free session. No mic, no reading.
// The session is a flat list of segments the player runs one after another.
// Spoken text is written in the feminine like the rest of the app; the player converts it (addr) when speaking.

import { MAQAMAT } from './maqam';
import { VOCALISES, vocaliseKeys, vocaliseNotes } from './vocalise';
import { LADDER_DEGREES } from './ladder';
import type { VideoKey } from '../content/videos';

export type CarSegment =
  | { kind: 'section'; title: string; video: VideoKey } // marks where an exercise starts (for the list before driving)
  | { kind: 'say'; text: string }
  | { kind: 'notes'; notes: { midi: number; dur: number }[]; gap?: number; label: string }
  | { kind: 'pause'; seconds: number; label: string };

/** Rough length of a segment in seconds (speech ≈ 12 characters per second). */
export function segmentSeconds(s: CarSegment): number {
  if (s.kind === 'section') return 0;
  if (s.kind === 'say') return Math.max(2, s.text.length / 12);
  if (s.kind === 'pause') return s.seconds;
  return s.notes.reduce((a, n) => a + n.dur + (s.gap ?? 0), 0);
}

export function sessionSeconds(segs: CarSegment[]): number {
  return segs.reduce((a, s) => a + segmentSeconds(s), 0);
}

/**
 * A session of about `minutes` (10–20): breathing + hum, vocalises across the range, the do-re-mi ladder,
 * a maqam slowly, then a gentle cool-down. Each block is "listen → sing it back".
 */
export function buildCarSession(minutes: number, low: number, high: number, maqamId = 'ajam'): CarSegment[] {
  const target = Math.max(10, Math.min(20, minutes)) * 60;
  const mid = Math.round((low + high) / 2);
  const segs: CarSegment[] = [];
  const say = (text: string) => segs.push({ kind: 'say', text });
  const pause = (seconds: number, label: string) => segs.push({ kind: 'pause', seconds, label });
  const section = (title: string, video: VideoKey) => segs.push({ kind: 'section', title, video });

  say('أهلاً. خلّي عينك على الطريق، والتطبيق هيقول كل حاجة بالصوت.');
  section('التنفس وسسسس', 'breathing');
  say('نبدأ بالنفس: شهيق من البطن أربع عدات، وبعدين سسسس طويلة.');
  for (let i = 0; i < 3; i++) pause(10, 'شهيق ٤ وبعدين سسسس');
  section('الهمهمة "مممم"', 'humming');
  say('همهمة: اسمعي النغمة، وبعدين همهمي مممم.');
  for (const m of [mid - 2, mid, mid + 2]) {
    segs.push({ kind: 'notes', notes: [{ midi: m, dur: 1.5 }], label: 'اسمعي' });
    pause(3, 'همهمة مممم');
  }

  // vocalises until about 70% of the time, then ladder + maqam + cool-down
  const blocks = [VOCALISES[0], VOCALISES[1], VOCALISES[3], VOCALISES[2], VOCALISES[4]];
  let bi = 0;
  const vocaliseBlock = () => {
    const v = blocks[bi++ % blocks.length];
    section(v.ar, v.video);
    say(`تمرين ${v.ar}: اسمعيه، وبعدين كرريه بعدي.`);
    for (const k of vocaliseKeys(v, low, high, 4)) {
      const notes = vocaliseNotes(v, k).map((n) => ({ midi: n.midi, dur: n.dur }));
      segs.push({ kind: 'notes', notes, gap: v.gap, label: v.ar });
      pause(notes.reduce((a, n) => a + n.dur + (v.gap ?? 0), 0) + 0.5, `دورك: ${v.syllables[0]}`);
    }
  };
  vocaliseBlock();
  while (sessionSeconds(segs) < target * 0.6) vocaliseBlock();

  section('سلم دو ري مي', 'doremi');
  say('سلم دو ري مي: اسمعي كل نغمة وقولي اسمها بعدها.');
  const doMidi = Math.max(low, Math.min(high - 7, 60 - 12 * Math.round((60 - mid) / 12)));
  for (const d of LADDER_DEGREES) {
    segs.push({ kind: 'notes', notes: [{ midi: doMidi + d, dur: 1 }], label: 'دو ري مي' });
    pause(1.5, 'قولي اسم النغمة');
  }

  const maqam = MAQAMAT.find((m) => m.id === maqamId) ?? MAQAMAT[0];
  section(`مقام ${maqam.ar}`, 'maqam');
  say(`مقام ${maqam.ar} على مهلك: درجة درجة.`);
  for (const c of maqam.up) {
    segs.push({ kind: 'notes', notes: [{ midi: doMidi + c / 100, dur: 1.4 }], label: `مقام ${maqam.ar}` });
    pause(2, 'غني الدرجة');
  }

  while (sessionSeconds(segs) < target * 0.92) vocaliseBlock();
  section('التهدئة', 'cooldown');
  say('وفي الآخر تهدئة: همهمة هادية ونازلة.');
  for (const m of [mid + 2, mid, mid - 2, mid - 4]) {
    segs.push({ kind: 'notes', notes: [{ midi: m, dur: 1.5 }], label: 'تهدئة' });
    pause(2.5, 'همهمة');
  }
  say('برافو! خلصنا. اشربي مية وريّحي صوتك.');
  return segs;
}

/** The exercises a session contains, in order, each once (shown with YouTube links before driving). */
export function sessionExercises(segs: CarSegment[]): { title: string; video: VideoKey }[] {
  const seen = new Set<string>();
  const out: { title: string; video: VideoKey }[] = [];
  for (const s of segs) if (s.kind === 'section' && !seen.has(s.title)) {
    seen.add(s.title);
    out.push({ title: s.title, video: s.video });
  }
  return out;
}
