import { useRef, useState } from 'react';
import { YouTubeSearch } from '../components/Demo';
import { LessonLink } from '../components/LessonLink';
import { CentsMeter, ErrorText, Page, Stat } from '../components/ui';
import { SoundPicker } from '../components/SoundPicker';
import { OctaveHint } from '../components/OctaveHint';
import { HoldRing } from '../components/HoldRing';
import { ActivityBadge } from '../components/ActivityBadge';
import { useMic } from '../audio/useMic';
import { playNote } from '../audio/sound';
import { centsBetween, midiToFreq, quarterToneName } from '../lib/music';
import { chooseTonic, MAQAMAT, maqamSequence, type Degree, type Direction } from '../lib/maqam';
import { guidance, HoldTracker, mean, percent } from '../lib/stats';
import { addResult } from '../lib/storage';
import { exerciseRange, NO_RANGE_HINT } from './common';

const TOLERANCE = 25;

type DegreeResult = { status: 'ok'; cents: number } | { status: 'skip' } | undefined;

const DIRECTIONS: { id: Direction; ar: string }[] = [
  { id: 'up', ar: 'صعود' },
  { id: 'down', ar: 'نزول' },
  { id: 'both', ar: 'صعود ونزول' },
];

interface MaqamProps {
  /** beginner path: today's maqam and a tonic from the middle of the range */
  maqamId?: string;
  tonic?: number;
  /** longer reference notes and a longer hold */
  slow?: boolean;
  onResult?: (percentOk: number) => void;
}

export function MaqamPage({ maqamId: fixedMaqam, tonic: fixedTonic, slow, onResult }: MaqamProps = {}) {
  const range = useRef(exerciseRange()).current;
  const [maqamId, setMaqamId] = useState(fixedMaqam ?? MAQAMAT[0].id);
  const [direction, setDirection] = useState<Direction>(slow ? 'up' : 'both');
  const [tonic, setTonic] = useState(() => fixedTonic ?? chooseTonic(range.low, range.high));
  const [index, setIndex] = useState<number | null>(null); // current degree while running
  const [results, setResults] = useState<DegreeResult[]>([]);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);

  const maqam = MAQAMAT.find((m) => m.id === maqamId)!;
  const seq = maqamSequence(maqam, midiToFreq(tonic), direction);

  const hold = useRef(new HoldTracker(TOLERANCE, slow ? 1000 : 800));
  const heldCents = useRef<number[]>([]);
  const rawRecent = useRef<number[]>([]); // raw cents for the octave hint
  const resultsRef = useRef<DegreeResult[]>([]);
  const last = useRef(0);
  const run = useRef({ index: null as number | null, seq, busy: false });
  run.current.seq = seq;

  const { frame, error, start, stop } = useMic((f) => {
    const dt = last.current ? f.t - last.current : 0;
    last.current = f.t;
    const r = run.current;
    if (r.index === null || r.busy) return;
    const target = r.seq[r.index];
    const cents = f.freq ? centsBetween(f.freq, target.freq) : null;
    if (cents !== null) rawRecent.current = [...rawRecent.current.slice(-39), cents];
    setProgress(hold.current.update(cents, dt));
    if (hold.current.progress === 0) heldCents.current = [];
    else if (cents !== null && Math.abs(cents) <= TOLERANCE) heldCents.current.push(cents);
    if (hold.current.done) finishDegree({ status: 'ok', cents: Math.round(mean(heldCents.current)) });
  });

  const goTo = async (i: number) => {
    const r = run.current;
    r.index = i;
    r.busy = true;
    setIndex(i);
    setProgress(0);
    await playNote(r.seq[i].freq, slow ? 2 : 1.2);
    hold.current.reset();
    heldCents.current = [];
    rawRecent.current = [];
    r.busy = false;
  };

  const finishDegree = (res: DegreeResult) => {
    const r = run.current;
    if (r.index === null) return;
    const i = r.index;
    r.busy = true;
    resultsRef.current[i] = res;
    setResults([...resultsRef.current]);
    setTimeout(
      () => {
        if (i + 1 < r.seq.length) void goTo(i + 1);
        else complete();
      },
      res?.status === 'ok' ? 500 : 0,
    );
  };

  const complete = () => {
    run.current.index = null;
    setIndex(null);
    setDone(true);
    stop();
    const ok = resultsRef.current.filter((x) => x?.status === 'ok').length;
    addResult('maqam', percent(ok, run.current.seq.length), maqam.ar);
    onResult?.(percent(ok, run.current.seq.length));
  };

  const begin = async () => {
    resultsRef.current = [];
    setResults([]);
    setDone(false);
    const mic = await start();
    if (mic) await goTo(0);
  };

  const cancel = () => {
    run.current.index = null;
    setIndex(null);
    stop();
  };

  const playScale = async () => {
    for (const d of seq) await playNote(d.freq, 0.6);
  };

  const target = index !== null ? seq[index] : null;
  const cents = target && frame?.freq ? centsBetween(frame.freq, target.freq) : null;
  const okCount = results.filter((x) => x?.status === 'ok').length;
  const running = index !== null;

  return (
    <Page tips mic help="maqam" title="المقامات" intro="هتسمعي كل درجة من المقام وتغنيها. الحكم على الربع تون الحقيقي، مش على أقرب نغمة بيانو.">
      <YouTubeSearch k="maqam" />
      <LessonLink id="maqam" what="مقام" />
      {!range.fromTest && fixedTonic === undefined && <p className="hint">{NO_RANGE_HINT}</p>}
      <ErrorText text={error} />

      {!running && (
        <div className="panel">
          <SoundPicker />
          <div className="choices" hidden={!!fixedMaqam}>
            {MAQAMAT.map((m) => (
              <button key={m.id} className={m.id === maqamId ? 'chip active' : 'chip'} onClick={() => setMaqamId(m.id)}>
                {m.ar}
              </button>
            ))}
          </div>
          <div className="choices">
            {DIRECTIONS.map((d) => (
              <button key={d.id} className={d.id === direction ? 'chip active' : 'chip'} onClick={() => setDirection(d.id)}>
                {d.ar}
              </button>
            ))}
          </div>
          <div className="row tonic">
            <button onClick={() => setTonic((t) => t - 1)} aria-label="القرار أوطى">
              −
            </button>
            <span>
              القرار: <b dir="ltr">{quarterToneName(tonic).name}</b> ({quarterToneName(tonic).ar})
            </span>
            <button onClick={() => setTonic((t) => t + 1)} aria-label="القرار أعلى">
              +
            </button>
          </div>
          <div className="row">
            <button onClick={playScale}>🔊 اسمعي المقام</button>
            <button className="big primary" onClick={begin}>
              ابدئي
            </button>
          </div>
        </div>
      )}

      <DegreeList seq={seq} tonic={tonic} results={results} current={index} />

      {running && target && (
        <div className="panel center">
          <p className="hint">
            الدرجة {target.degree} — غنيها واثبتي عليها
          </p>
          <DegreeName tonic={tonic} d={target} big />
          <CentsMeter cents={cents} tolerance={TOLERANCE} />
          <OctaveHint rawCents={rawRecent.current} fromTest={range.fromTest} />
          <p className="guide">{cents !== null ? guidance(cents, TOLERANCE).ar : '…'}</p>
          <HoldRing progress={progress} label="اثبتي على الدرجة" />
          <ActivityBadge />
          <div className="row">
            <button onClick={() => goTo(index!)}>🔊 اسمعيها تاني</button>
            <button onClick={() => finishDegree({ status: 'skip' })}>تخطي</button>
          </div>
          <button className="link" onClick={cancel}>
            وقفي التمرين
          </button>
        </div>
      )}

      {done && (
        <div className="panel center">
          <div className="stats">
            <Stat label={`مقام ${maqam.ar}`} value={`${okCount}/${seq.length}`} />
            <Stat label="النتيجة" value={`${percent(okCount, seq.length)}%`} />
          </div>
          <p className="ok-text">النتيجة اتحفظت ✔</p>
        </div>
      )}
    </Page>
  );
}

function DegreeName({ tonic, d, big }: { tonic: number; d: Degree; big?: boolean }) {
  const n = quarterToneName(tonic + d.cents / 100);
  return (
    <div className={big ? 'target-note' : ''}>
      <span dir="ltr">{n.name}</span> <small>{n.ar}</small>
    </div>
  );
}

function DegreeList({ seq, tonic, results, current }: { seq: Degree[]; tonic: number; results: DegreeResult[]; current: number | null }) {
  return (
    <ol className="degrees">
      {seq.map((d, i) => {
        const r = results[i];
        const cls = i === current ? 'current' : r?.status === 'ok' ? 'ok' : r?.status === 'skip' ? 'skip' : '';
        return (
          <li key={i} className={cls}>
            <DegreeName tonic={tonic} d={d} />
            <small>{r?.status === 'ok' ? `${r.cents > 0 ? '+' : ''}${r.cents}¢` : r?.status === 'skip' ? 'اتخطت' : `${d.cents}¢`}</small>
          </li>
        );
      })}
    </ol>
  );
}
