import { useEffect, useRef, useState } from 'react';
import { YouTubeSearch } from '../components/Demo';
import { LessonLink } from '../components/LessonLink';
import { g } from '../lib/gender';
import { CentsMeter, ErrorText, LiveNote, Page, Stat } from '../components/ui';
import { SoundPicker } from '../components/SoundPicker';
import { OctaveHint } from '../components/OctaveHint';
import { HoldRing } from '../components/HoldRing';
import { ActivityBadge } from '../components/ActivityBadge';
import { useMic } from '../audio/useMic';
import { playNote } from '../audio/sound';
import { guidance, HoldTracker } from '../lib/stats';
import { noteName, noteNameAr } from '../lib/music';
import { PASS_RIGHT, PASS_WINDOW, rightInWindow } from '../lib/ear';
import { currentIntervalLevel, INTERVAL_LEVELS, intervalDeviation, intervalInfo, isLevelOpen, makeIntervalTask, type IntervalTask } from '../lib/intervalSing';
import { addIntervalAnswer, addResult, getIntervalHistory } from '../lib/storage';
import { exerciseRange } from './common';

const TOLERANCE = 25;

/** Sing an interval above (later below) a note. `level` fixed = beginner path mode (no level list). */
export function IntervalPage({ level: fixedLevel, onResult }: { level?: number; onResult?: (right: number, total: number) => void } = {}) {
  const range = useRef(exerciseRange()).current;
  const [history, setHistory] = useState(getIntervalHistory);
  const [level, setLevel] = useState(() => fixedLevel ?? currentIntervalLevel(getIntervalHistory()));
  const [task, setTask] = useState<IntervalTask | null>(null);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<'right' | 'wrong' | null>(null);
  const run = useRef({ task: null as IntervalTask | null, busy: false, done: false, last: 0 });
  const hold = useRef(new HoldTracker(TOLERANCE, 1000));
  const rawRecent = useRef<number[]>([]); // raw cents for the octave hint
  const session = useRef({ right: 0, total: 0, unsaved: { right: 0, total: 0 } });

  const saveBlock = () => {
    const u = session.current.unsaved;
    if (u.total >= 5) addResult('intervals', Math.round((u.right / u.total) * 100), `${u.right}/${u.total}`);
    session.current.unsaved = { right: 0, total: 0 };
  };
  useEffect(() => saveBlock, []);

  const record = (right: boolean) => {
    setHistory(addIntervalAnswer(level, right));
    const s = session.current;
    s.total++;
    s.unsaved.total++;
    if (right) {
      s.right++;
      s.unsaved.right++;
    }
    if (s.unsaved.total >= PASS_WINDOW) saveBlock();
    onResult?.(s.right, s.total);
  };

  const { frame, error, start, stop } = useMic((f) => {
    const r = run.current;
    const dt = r.last ? f.t - r.last : 0;
    r.last = f.t;
    if (!r.task || r.busy || r.done) return;
    const dev = f.freq ? intervalDeviation(f.freq, r.task.target, r.task.cents) : null;
    if (dev !== null) rawRecent.current = [...rawRecent.current.slice(-39), dev];
    setProgress(hold.current.update(dev, dt));
    if (hold.current.done) {
      r.done = true;
      setResult('right');
      record(true);
    }
  });

  const playRef = async (t: IntervalTask) => {
    run.current.busy = true;
    await playNote(t.refFreq, 1.3);
    run.current.busy = false;
    hold.current.reset();
  };

  const playAnswer = async (t: IntervalTask) => {
    run.current.busy = true;
    await playNote(t.refFreq, 0.9);
    await playNote(t.target, 1.2);
    run.current.busy = false;
    hold.current.reset();
  };

  const next = async () => {
    const t = makeIntervalTask(level, range.low, range.high);
    run.current = { ...run.current, task: t, done: false };
    rawRecent.current = [];
    setTask(t);
    setResult(null);
    setProgress(0);
    if (await start()) await playRef(t);
  };

  const skip = () => {
    if (!task || run.current.done) return;
    run.current.done = true;
    setResult('wrong');
    record(false);
  };

  const chooseLevel = (i: number) => {
    saveBlock();
    stop();
    setLevel(i);
    setTask(null);
    run.current.task = null;
  };

  const info = task ? intervalInfo(task.cents) : null;
  const dev = task && frame?.freq ? intervalDeviation(frame.freq, task.target, task.cents) : null;
  const answers = history[level] ?? [];

  return (
    <Page tips mic help="intervals" title="غنا الفواصل" intro="هتسمعي نغمة، وتغني المسافة المطلوبة فوقها (وبعدين تحتها). النجاح = في حدود ±٢٥ سنت لمدة ثانية.">
      <YouTubeSearch k="intervals" />
      <LessonLink id="tone" what="تون ونص تون (المسافات)" />
      <ErrorText text={error} />
      <SoundPicker />
      {fixedLevel === undefined && (
        <div className="choices">
          {INTERVAL_LEVELS.map((l, i) => {
            const open = isLevelOpen(i, history);
            return (
              <button key={l.n} className={i === level ? 'chip active' : 'chip'} disabled={!open} onClick={() => chooseLevel(i)} title={open ? '' : 'اوصلي ٨ من ١٠ في المستوى اللي قبله'}>
                {open ? '' : '🔒 '}
                {l.n}. {l.ar}
              </button>
            );
          })}
        </div>
      )}

      <div className="panel center">
        <h2>
          المستوى {INTERVAL_LEVELS[level].n}: {INTERVAL_LEVELS[level].ar}
        </h2>
        <div className="stats">
          <Stat label={`صح من آخر ${PASS_WINDOW}`} value={`${rightInWindow(answers)} / ${Math.min(PASS_WINDOW, answers.length)}`} />
          <Stat label={`${g('محتاجة', 'محتاج')} عشان المستوى الجاي`} value={`${PASS_RIGHT} من ${PASS_WINDOW}`} />
        </div>

        {!task || !info ? (
          <button className="big primary" onClick={next}>
            ▶️ ابدئي
          </button>
        ) : (
          <>
            <p className="hint">
              النغمة: <b dir="ltr">{noteName(task.refMidi)}</b> ({noteNameAr(task.refMidi)})
            </p>
            <div className="target-note">
              {info.ar} {task.cents === 0 ? '' : task.down ? '⬇️ تحتها' : '⬆️ فوقها'}
              <small dir="ltr">{info.en}</small>
            </div>
            {info.tune && <p className="hint">🎵 {info.tune}</p>}
            <LiveNote freq={frame?.freq ?? null} />
            <CentsMeter cents={result ? null : dev} tolerance={TOLERANCE} />
            {!result && <OctaveHint rawCents={rawRecent.current} fromTest={range.fromTest} />}
            <p className={'guide' + (result === 'right' ? ' ok-text' : '')}>
              {result === 'right' ? 'برافو! 🎉' : result === 'wrong' ? 'ولا يهمك — اسمعي الإجابة وجربي اللي بعدها' : dev !== null ? guidance(dev, TOLERANCE).ar : 'غني…'}
            </p>
            <HoldRing progress={progress} ok={result === 'right'} />
            <ActivityBadge done={!!result} />
            <div className="row">
              <button onClick={() => playRef(task)}>🔊 النغمة تاني</button>
              <button onClick={() => playAnswer(task)}>💡 اسمعي الإجابة</button>
              {result ? (
                <button className="primary" onClick={next}>
                  اللي بعدها ←
                </button>
              ) : (
                <button onClick={skip}>تخطي</button>
              )}
            </div>
          </>
        )}
      </div>
    </Page>
  );
}
