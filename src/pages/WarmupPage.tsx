import { useRef, useState } from 'react';
import { g } from '../lib/gender';
import { ErrorText, LiveNote, Page, Stat } from '../components/ui';
import { useMic } from '../audio/useMic';
import { playNote } from '../audio/sound';
import { foldToOctaveOf, octaveInsensitiveCents, type PitchPoint } from '../lib/compare';
import { freqToMidi, midiToFreq, noteName } from '../lib/music';
import { middleRange } from '../lib/path';
import { humNotes, noiseThreshold, SIREN_SECONDS, sirenFollow, sirenTarget, sirenWords, soundingSeconds } from '../lib/warmup';
import { exerciseRange } from './common';
import { StepNav } from '../components/StepNav';
import { savedNoise } from '../lib/noise';
import { playGlide, YouTubeSearch } from '../components/Demo';
import { playNote as playDemoNote } from '../audio/sound';
import { humIsReal, sirenIsReal, trillIsReal } from '../lib/stepRules';

type Step = 'trill' | 'siren' | 'hum' | 'done';
const STEPS: Step[] = ['trill', 'siren', 'hum', 'done'];

export function WarmupNote() {
  return (
    <div className="notes" role="note">
      🌿 الإحماء لازم يبقى <b>هادي</b>: مش بصوت عالي ومش نغمات عالية. لو حسّيتي بأي وجع أو حرقان، <b>وقفي</b>.
    </div>
  );
}

/** ~3 minutes: lip trill → siren → humming. `light` = shorter. onDone gets how many of the 3 parts really happened. */
export function WarmupPage({ light, onDone }: { light?: boolean; onDone?: (partsDone: number, sirenCents: number | null) => void } = {}) {
  const [step, setStep] = useState<Step>('trill');
  const sirenResult = useRef<number | null>(null);
  const partsDone = useRef(0);
  const range = useRef(exerciseRange()).current;
  const mid = middleRange(range.low, range.high);
  const wide = { low: range.low + 1, high: range.high - 1 };

  /** real = this part had a real result; skipped parts save nothing */
  const next = (real: boolean) => {
    if (real) partsDone.current++;
    const i = STEPS.indexOf(step);
    const n = STEPS[i + 1] ?? 'done';
    setStep(n);
    if (n === 'done') onDone?.(partsDone.current, sirenResult.current);
  };

  return (
    <Page tips mic help="warmup" title="الإحماء" intro="حوالي ٣ دقايق قبل أي تمرين: ترعيش الشفايف، سيرينة، وهمهمة.">
      <WarmupNote />
      <p className="hint">
        خطوة {Math.min(3, STEPS.indexOf(step) + 1)} من ٣
      </p>
      {step === 'trill' && <Trill seconds={light ? 30 : 45} onNext={next} />}
      {step === 'siren' && (
        <Siren
          seconds={light ? 40 : SIREN_SECONDS}
          mid={mid}
          wide={wide}
          onNext={(c) => {
            sirenResult.current = c ?? null;
            next(c !== undefined);
          }}
        />
      )}
      {step === 'hum' && <Hum notes={humNotes(mid, light ? 3 : 5)} onNext={next} />}
      {step === 'done' && (
        <div className="panel center">
          <h2>صوتك سخن ✔</h2>
          <p>كده {g('جاهزة', 'جاهز')} للتمرين. افضلي اشربي مية.</p>
          <button
            className="big"
            onClick={() => {
              partsDone.current = 0;
              setStep('trill');
            }}
          >
            عيدي الإحماء
          </button>
        </div>
      )}
    </Page>
  );
}

/** 1. Lip trill "brrr": a timer and live loudness (no pitch judging — a trill's pitch is unreliable). */
function Trill({ seconds, onNext }: { seconds: number; onNext: (real: boolean) => void }) {
  const frames = useRef<{ t: number; rms: number }[]>([]);
  const t0 = useRef(0);
  const [left, setLeft] = useState(seconds);
  const [sounding, setSounding] = useState(0);
  const [running, setRunning] = useState(false);
  const { frame, error, start, stop } = useMic((f) => {
    const t = f.t / 1000;
    frames.current.push({ t, rms: f.rms });
    const l = seconds - (t - t0.current);
    setLeft(Math.max(0, l));
    if (frames.current.length % 10 === 0) setSounding(soundingSeconds(frames.current, noiseThreshold(frames.current.map((x) => x.rms), savedNoise())));
    if (l <= 0) {
      stop();
      setRunning(false);
    }
  });
  const begin = async () => {
    frames.current = [];
    t0.current = performance.now() / 1000;
    setSounding(0);
    if (await start()) setRunning(true);
  };
  const threshold = noiseThreshold(frames.current.map((x) => x.rms), savedNoise());
  const level = frame ? Math.min(1, frame.rms / (threshold * 4)) : 0;
  return (
    <div className="panel center">
      <h2>١. ترعيش الشفايف "بررررر"</h2>
      <YouTubeSearch k="lipTrill" />
      <p>قفلي شفايفك بالراحة وطلّعي هوا يخليهم يترعشوا "بررررر" (زي صوت العربية للأطفال). لو صعب، حطي صوابعك على خدودك وزقيهم لفوق شوية.</p>
      <ErrorText text={error} />
      {running ? (
        <>
          <div className="timer">{Math.ceil(left)}</div>
          <div className="loud-bar" aria-label="علو الصوت">
            <div style={{ width: `${Math.round(level * 100)}%` }} />
          </div>
          <Stat label="ثواني فيها صوت" value={Math.round(sounding)} />
          <p className="hint">{level > 0.25 ? 'كملي كده 👍' : 'خدي نفس وكملي "بررر"…'}</p>
        </>
      ) : (
        <>
          {frames.current.length > 0 && <Stat label="ثواني فيها صوت" value={Math.round(sounding)} />}
          <button className="big primary" onClick={begin}>
            {frames.current.length ? 'مرة كمان' : 'ابدئي'}
          </button>
        </>
      )}
      <StepNav
        ok={trillIsReal(sounding)}
        need="لسه محتاجين نسمع البررر ٥ ثواني على الأقل."
        onNext={() => {
          stop();
          onNext(true);
        }}
        onSkip={() => {
          stop();
          onNext(false);
        }}
      />
    </div>
  );
}

/** 2. Siren: follow a gliding line; her pitch (moved to the line's octave) is drawn on top. */
function Siren({ seconds, mid, wide, onNext }: { seconds: number; mid: { low: number; high: number }; wide: { low: number; high: number }; onNext: (avgCents: number | null | undefined) => void }) {
  const sung = useRef<PitchPoint[]>([]);
  const t0 = useRef(0);
  const [now, setNow] = useState(0);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ avgCents: number | null; voicedShare: number; seconds: number } | null>(null);
  const target = (t: number) => sirenTarget(t, mid, wide, seconds);

  const finish = () => {
    stop();
    setRunning(false);
    setResult({ ...sirenFollow(sung.current, target), seconds: sung.current.length ? sung.current[sung.current.length - 1].t : 0 });
  };

  const { frame, error, start, stop } = useMic((f) => {
    const t = f.t / 1000 - t0.current;
    sung.current.push({ t, freq: f.freq });
    if (sung.current.length % 4 === 0) setNow(t);
    if (t >= seconds) finish();
  });

  const begin = async () => {
    sung.current = [];
    setResult(null);
    setNow(0);
    t0.current = performance.now() / 1000;
    if (await start()) setRunning(true);
  };

  // graph
  const W = 520;
  const H = 180;
  const loM = wide.low - 2;
  const hiM = wide.high + 2;
  const x = (t: number) => (t / seconds) * W;
  const y = (m: number) => H - ((m - loM) / (hiM - loM)) * H;
  const targetPath = Array.from({ length: 241 }, (_, i) => (i / 240) * seconds)
    .map((t, i) => `${i ? 'L' : 'M'}${x(t).toFixed(1)},${y(target(t)).toFixed(1)}`)
    .join('');
  let sungPath = '';
  let pen = false;
  for (const p of sung.current) {
    if (!p.freq) {
      pen = false;
      continue;
    }
    const m = freqToMidi(foldToOctaveOf(p.freq, midiToFreq(target(p.t))));
    sungPath += `${pen ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(m).toFixed(1)}`;
    pen = true;
  }
  const liveOff = running && frame?.freq ? Math.round(octaveInsensitiveCents(frame.freq, midiToFreq(target(now)))) : null;

  return (
    <div className="panel center">
      <h2>٢. السيرينة "ووووو"</h2>
      <div className="row">
        <button onClick={() => playGlide(mid.low, mid.high, 5)}>🔊 اسمعي المثال</button>
        <YouTubeSearch k="siren" />
      </div>
      <p>
        قولي "وووو" أو "نننن" وامشي مع الخط بنعومة لفوق ولتحت، زي صوت الإسعاف بس هادي. الخط بيبتدي في نص صوتك (<span dir="ltr">{noteName(mid.low)}–{noteName(mid.high)}</span>) وبيوسع شوية.
      </p>
      <ErrorText text={error} />
      <svg className="siren" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="خط السيرينة وصوتك">
        <path className="target" d={targetPath} />
        <path className="sung" d={sungPath} />
        {running && <line className="now" x1={x(now)} x2={x(now)} y1={0} y2={H} />}
      </svg>
      <p className="legend">
        <span className="swatch ref" /> الخط <span className="swatch sung" /> صوتك
      </p>
      {running ? (
        <>
          <LiveNote freq={frame?.freq ?? null} />
          <p className="hint">{liveOff === null ? '…' : Math.abs(liveOff) <= 60 ? `${g('ماشية', 'ماشي')} مع الخط 👍` : liveOff > 0 ? 'أعلى من الخط شوية' : 'أوطى من الخط شوية'}</p>
          <button onClick={finish}>⏹ كفاية</button>
        </>
      ) : (
        <>
          {result && (
            <>
              <Stat label={`${g('بعيدة', 'بعيد')} عن الخط في المتوسط`} value={result.avgCents === null ? '—' : `${result.avgCents} سنت`} />
              <p className="ok-text">{sirenWords(result.avgCents)}</p>
            </>
          )}
          <button className="big primary" onClick={begin}>
            {result ? 'مرة كمان' : 'ابدئي'}
          </button>
        </>
      )}
      <StepNav
        ok={!!result && sirenIsReal(result.voicedShare, result.seconds)}
        need="لسه محتاجين نسمع صوتك مع الخط ١٠ ثواني على الأقل."
        onNext={() => onNext(result?.avgCents ?? null)}
        onSkip={() => {
          if (running) {
            stop();
            setRunning(false);
          }
          onNext(undefined);
        }}
      />
    </div>
  );
}

const HUM_LISTEN_SECONDS = 4;

/** 3. Humming "mmm" on a few notes going up by semitones, with light pitch feedback. */
function Hum({ notes, onNext }: { notes: number[]; onNext: (real: boolean) => void }) {
  const [i, setI] = useState<number | null>(null);
  const [phase, setPhase] = useState<'idle' | 'play' | 'listen' | 'done'>('idle');
  const [left, setLeft] = useState(0);
  const [results, setResults] = useState<(number | null)[]>([]);
  const offs = useRef<number[]>([]);
  const t0 = useRef(0);
  const run = useRef({ i: null as number | null, phase: 'idle' as string });

  const { frame, error, start, stop } = useMic((f) => {
    const r = run.current;
    if (r.phase !== 'listen' || r.i === null) return;
    const t = f.t / 1000 - t0.current;
    if (f.freq && t > 0.6) offs.current.push(octaveInsensitiveCents(f.freq, midiToFreq(notes[r.i])));
    setLeft(Math.max(0, HUM_LISTEN_SECONDS - t));
    if (t >= HUM_LISTEN_SECONDS) endNote();
  });

  const playAt = async (n: number) => {
    run.current = { i: n, phase: 'play' };
    setI(n);
    setPhase('play');
    await playNote(midiToFreq(notes[n]), 1.3);
    offs.current = [];
    t0.current = performance.now() / 1000;
    run.current.phase = 'listen';
    setPhase('listen');
  };

  function endNote() {
    const r = run.current;
    if (r.i === null) return;
    const n = r.i;
    r.phase = 'idle';
    const sorted = [...offs.current].sort((a, b) => a - b);
    const med = sorted.length ? Math.round(sorted[Math.floor(sorted.length / 2)]) : null;
    setResults((cur) => {
      const c = [...cur];
      c[n] = med;
      return c;
    });
    if (n + 1 < notes.length) void playAt(n + 1);
    else {
      stop();
      setPhase('done');
      setI(null);
    }
  }

  const begin = async () => {
    setResults([]);
    if (await start()) await playAt(0);
  };

  const live = phase === 'listen' && i !== null && frame?.freq ? octaveInsensitiveCents(frame.freq, midiToFreq(notes[i])) : null;
  const feel = (c: number | null) => (c === null ? '—' : Math.abs(c) <= 30 ? 'حلو ✔' : c > 0 ? 'أعلى شوية' : 'أوطى شوية');

  return (
    <div className="panel center">
      <h2>٣. الهمهمة "مممم"</h2>
      <div className="row">
        <button
          onClick={async () => {
            for (const n of notes) await playDemoNote(midiToFreq(n), 0.8);
          }}
        >
          🔊 اسمعي المثال
        </button>
        <YouTubeSearch k="humming" />
      </div>
      <p>شفايفك مقفولة بالراحة وسنانك مش لازقة في بعض. اسمعي النغمة وهمهمي "مممم" عليها بهدوء — هنطلع نص تون كل مرة.</p>
      <ErrorText text={error} />
      <ol className="degrees">
        {notes.map((n, k) => (
          <li key={n} className={k === i ? 'current' : results[k] !== undefined ? (results[k] !== null && Math.abs(results[k]!) <= 30 ? 'ok' : 'skip') : ''}>
            <span dir="ltr">{noteName(n)}</span>
            <small>{results[k] !== undefined ? feel(results[k]) : ''}</small>
          </li>
        ))}
      </ol>
      {phase === 'play' && <p className="guide">اسمعي…</p>}
      {phase === 'listen' && (
        <>
          <p className="guide">مممم… {Math.ceil(left)}</p>
          <LiveNote freq={frame?.freq ?? null} />
          <p className="hint">{live === null ? '' : feel(live)}</p>
        </>
      )}
      {(phase === 'idle' || phase === 'done') && (
        <button className="big primary" onClick={begin}>
          {phase === 'done' ? 'مرة كمان' : 'ابدئي'}
        </button>
      )}
      <StepNav
        ok={humIsReal(results)}
        need="لسه محتاجين نسمع الهمهمة على نغمتين على الأقل."
        onNext={() => {
          run.current.phase = 'idle';
          stop();
          onNext(true);
        }}
        onSkip={() => {
          run.current.phase = 'idle';
          stop();
          onNext(false);
        }}
      />
    </div>
  );
}
