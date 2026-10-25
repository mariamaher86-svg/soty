import { useRef, useState } from 'react';
import { ErrorText, Page } from '../components/ui';
import { SoundPicker } from '../components/SoundPicker';
import { HoldRing } from '../components/HoldRing';
import { ActivityBadge } from '../components/ActivityBadge';
import { YouTubeSearch } from '../components/Demo';
import { useMic } from '../audio/useMic';
import { playNote } from '../audio/sound';
import { centsBetween, midiToFreq, noteName } from '../lib/music';
import { HoldTracker } from '../lib/stats';
import { dotPosition, LADDER_NAMES, LADDER_TOLERANCE, ladderCents, ladderGuide, ladderNotes, ladderTip } from '../lib/ladder';
import { inUserOctave } from '../lib/voice';
import { exerciseRange } from './common';
import { addResult } from '../lib/storage';

/** "إزاي أجيب دو صح؟": hear → hum → slide until the dot sits on the line → hold 1 s → next (do re mi fa sol, back down). */
export function FindNotePage({ onResult }: { onResult?: (found: number) => void } = {}) {
  const range = useRef(exerciseRange()).current;
  const doMidi = useRef(inUserOctave(60, range.low, range.high - 7 >= range.low ? range.high - 7 : range.high)).current;
  const notes = useRef(ladderNotes(doMidi)).current;
  const [i, setI] = useState<number | null>(null);
  const [found, setFound] = useState<boolean[]>([]);
  const foundRef = useRef<boolean[]>([]);
  const [progress, setProgress] = useState(0);
  const [cents, setCents] = useState<number | null>(null);
  const [octave, setOctave] = useState(false);
  const [tip, setTip] = useState<string | null>(null);
  const run = useRef({ i: null as number | null, busy: false, last: 0, started: 0, recent: [] as number[], done: false });
  const hold = useRef(new HoldTracker(LADDER_TOLERANCE, 1000, 250));

  const { error, start, stop } = useMic((f) => {
    const r = run.current;
    const dt = r.last ? f.t - r.last : 0;
    r.last = f.t;
    if (r.i === null || r.busy || r.done) return;
    const raw = f.freq ? centsBetween(f.freq, midiToFreq(notes[r.i])) : null;
    const c = raw === null ? null : ladderCents(raw);
    setCents(c ? c.cents : null);
    setOctave(!!c?.octave);
    if (c) r.recent = [...r.recent.slice(-30), c.cents];
    setProgress(hold.current.update(c ? c.cents : null, dt));
    setTip(ladderTip((f.t - r.started) / 1000, r.recent));
    if (hold.current.done) {
      r.done = true;
      const n = r.i;
      foundRef.current[n] = true;
      setFound([...foundRef.current]);
      onResult?.(foundRef.current.filter(Boolean).length);
      setTimeout(() => (n + 1 < notes.length ? void goTo(n + 1) : finish()), 900);
    }
  });

  const goTo = async (n: number) => {
    const r = run.current;
    r.i = n;
    r.busy = true;
    r.done = false;
    r.recent = [];
    setI(n);
    setProgress(0);
    setCents(null);
    setTip(null);
    await playNote(midiToFreq(notes[n]), 1.6);
    hold.current.reset();
    r.started = performance.now();
    r.busy = false;
  };

  const begin = async () => {
    foundRef.current = [];
    setFound([]);
    if (await start()) await goTo(0);
  };

  function finish() {
    run.current.i = null;
    setI(null);
    stop();
    const n = foundRef.current.filter(Boolean).length;
    if (n) addResult('findnote', n, `${n}/${notes.length}`);
  }

  const guide = ladderGuide(cents);
  const target = i !== null ? notes[i] : null;
  // rungs shown: 3 semitones under and over the target
  const rungs = target !== null ? [3, 2, 1, 0, -1, -2, -3].map((d) => target + d) : [];
  const dot = cents !== null ? dotPosition(cents, 350) : null;
  const doneCount = found.filter(Boolean).length;

  return (
    <Page tips mic help="findnote" title="إزاي أجيب دو صح؟" intro="لو لسه صعب تمسكي النغمة: هنمسكها خطوة خطوة. اسمعي ← همهمي «مممم» بهدوء ← اطلعي أو انزلي ببطء لحد ما النقطة تيجي على الخط ← اثبتي ثانية.">
      <ErrorText text={error} />
      <SoundPicker />
      <div className="ladder-steps">
        {LADDER_NAMES.map((n, k) => (
          <span key={k} className={k === i ? 'now' : found[k] ? 'ok' : ''}>
            {found[k] ? '✔' : ''}
            {n}
          </span>
        ))}
      </div>

      {i === null ? (
        <div className="panel center">
          {doneCount > 0 && <p className="ok-text">لقيتي {doneCount} من {notes.length} نغمات 👏</p>}
          <button className="big primary" onClick={begin}>
            {doneCount ? 'مرة كمان' : '▶️ ابدئي'}
          </button>
          <YouTubeSearch k="findNote" />
        </div>
      ) : (
        <div className="panel center">
          <h2>
            «{LADDER_NAMES[i]}» <span dir="ltr">({noteName(notes[i])})</span>
          </h2>
          <ActivityBadge done={found[i]} />
          <div className="ladder-wrap">
            <div className={'ladder-arrow' + (guide === 'up' ? ' on' : '')}>⬆<small>اطلعي</small></div>
            <div className="ladder" aria-label="سلم النغمات">
              {rungs.map((m) => (
                <div key={m} className={m === target ? 'rung target' : 'rung'}>
                  <span dir="ltr">{noteName(m)}</span>
                </div>
              ))}
              {dot !== null && <div className={'ladder-dot' + (guide === 'ok' ? ' ok' : '')} style={{ bottom: `${dot * 100}%` }} />}
            </div>
            <div className={'ladder-arrow' + (guide === 'down' ? ' on' : '')}>⬇<small>انزلي</small></div>
          </div>
          <p className="guide">
            {found[i] ? '✔ برافو!' : guide === 'ok' ? 'كده! اثبتي…' : guide === 'up' ? 'اطلعي شوية ⬆' : guide === 'down' ? 'انزلي شوية ⬇' : 'همهمي «مممم» بهدوء…'}
          </p>
          {octave && <p className="hint">النقطة محسوبة على نفس النغمة بس في دور (أوكتاف) تاني — وده تمام.</p>}
          <HoldRing progress={progress} ok={found[i]} />
          {tip && !found[i] && <p className="notes">💡 {tip}</p>}
          <div className="row">
            <button onClick={() => goTo(i)}>🔊 اسمعي النغمة تاني</button>
            <button onClick={finish}>وقفي</button>
          </div>
        </div>
      )}
    </Page>
  );
}
