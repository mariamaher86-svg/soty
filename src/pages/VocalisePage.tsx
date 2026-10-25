import { useRef, useState } from 'react';
import { CentsMeter, ErrorText, Page, Stat } from '../components/ui';
import { SoundPicker } from '../components/SoundPicker';
import { ActivityBadge } from '../components/ActivityBadge';
import { YouTubeSearch } from '../components/Demo';
import { useMic } from '../audio/useMic';
import { playNote } from '../audio/sound';
import { midiToFreq, noteName, noteNameAr } from '../lib/music';
import { octaveInsensitiveCents } from '../lib/compare';
import { noteAt, patternLength, VOCALISES, vocaliseKeys, vocaliseNotes, type Vocalise } from '../lib/vocalise';
import { addResult } from '../lib/storage';
import { exerciseRange } from './common';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Vocalises: listen to the pattern, sing it back; each repetition a semitone higher, then back down. */
export function VocalisePage() {
  const range = useRef(exerciseRange()).current;
  const [v, setV] = useState<Vocalise>(VOCALISES[0]);
  const [phase, setPhase] = useState<'idle' | 'listen' | 'turn'>('idle');
  const [rep, setRep] = useState(0);
  const [noteIdx, setNoteIdx] = useState<number | null>(null);
  const [scores, setScores] = useState<number[]>([]);
  const [cents, setCents] = useState<number | null>(null);
  const run = useRef({ active: false, turnStart: 0, inTune: 0, voiced: 0, notes: [] as ReturnType<typeof vocaliseNotes> });
  const keys = vocaliseKeys(v, range.low, range.high);

  const { error, start, stop } = useMic((f) => {
    const r = run.current;
    if (phase !== 'turn' || !r.active) return;
    const t = (performance.now() - r.turnStart) / 1000;
    const n = noteAt(r.notes, t);
    setNoteIdx(n ? r.notes.indexOf(n) : null);
    if (!n || !f.freq) return setCents(null);
    const c = octaveInsensitiveCents(f.freq, midiToFreq(n.midi));
    setCents(c);
    r.voiced++;
    if (Math.abs(c) <= 50) r.inTune++; // light judging: within half a semitone
  });

  const playPattern = async (startMidi: number, cancellable: boolean) => {
    const notes = vocaliseNotes(v, startMidi);
    for (let k = 0; k < notes.length; k++) {
      if (cancellable && !run.current.active) return;
      setNoteIdx(k);
      await playNote(midiToFreq(notes[k].midi), notes[k].dur);
      if (v.gap) await wait(v.gap * 1000);
    }
    setNoteIdx(null);
  };

  const demo = async () => {
    run.current.active = false;
    await playPattern(keys[0], false);
  };

  const begin = async () => {
    if (!(await start())) return;
    const r = run.current;
    r.active = true;
    setScores([]);
    const all: number[] = [];
    for (let k = 0; k < keys.length && r.active; k++) {
      setRep(k);
      setPhase('listen');
      await playPattern(keys[k], true);
      if (!r.active) break;
      // her turn: the same pattern, same timing
      r.notes = vocaliseNotes(v, keys[k]);
      r.inTune = 0;
      r.voiced = 0;
      r.turnStart = performance.now() + 300;
      setPhase('turn');
      await wait(patternLength(v) * 1000 + 600);
      const score = r.voiced ? Math.round((r.inTune / r.voiced) * 100) : 0;
      all.push(score);
      setScores([...all]);
      await wait(400);
    }
    if (all.length) addResult('vocalise', Math.round(all.reduce((a, b) => a + b, 0) / all.length), v.ar);
    halt();
  };

  function halt() {
    run.current.active = false;
    setPhase('idle');
    setNoteIdx(null);
    setCents(null);
    stop();
  }

  const shown = vocaliseNotes(v, keys[Math.min(rep, keys.length - 1)]);

  return (
    <Page tips mic help="vocalise" title="تمارين الصوت (فوكاليز)" intro="تمارين كلاسيك زي «آه ها ها آآآ»: اسمعي النمط، وبعدين غنيه بعده. كل مرة بيطلع نص تون لحد آخر صوتك المريح، وبعدين بينزل.">
      <ErrorText text={error} />
      <div className="choices">
        {VOCALISES.map((x) => (
          <button key={x.id} disabled={phase !== 'idle'} className={x.id === v.id ? 'chip active' : 'chip'} onClick={() => setV(x)}>
            {x.ar}
          </button>
        ))}
      </div>
      <SoundPicker />
      <div className="panel center">
        <h2>{v.ar}</h2>
        <p className="hint">{v.what}</p>
        <div className="vocalise-notes">
          {shown.map((n, k) => (
            <span key={k} className={k === noteIdx ? 'now' : ''}>
              <b>{n.syllable}</b>
              <small dir="ltr">{noteName(n.midi)}</small>
              <small>{noteNameAr(n.midi).replace(/ \d+$/, '')}</small>
            </span>
          ))}
        </div>
        {phase === 'idle' ? (
          <>
            <div className="row">
              <button onClick={demo}>🔊 اسمعي المثال</button>
              <button className="big primary" onClick={begin}>
                ▶️ ابدئي
              </button>
            </div>
            <YouTubeSearch k={v.video} />
          </>
        ) : (
          <>
            <p className="guide">
              مرة {rep + 1} من {keys.length} — {phase === 'listen' ? '🔊 اسمعي…' : '🎤 دورك — غني نفس اللي سمعتيه'}
            </p>
            <ActivityBadge />
            {phase === 'turn' && <CentsMeter cents={cents} tolerance={50} range={150} />}
            <button onClick={halt}>⏹ وقفي</button>
          </>
        )}
        {scores.length > 0 && <Stat label="قربك من النغمات كل مرة" value={scores.map((s) => `${s}%`).join(' ← ')} />}
      </div>
    </Page>
  );
}
