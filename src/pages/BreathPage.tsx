import { useRef, useState } from 'react';
import { g } from '../lib/gender';
import { ErrorText, LiveNote, Page, Stat } from '../components/ui';
import { playNote } from '../audio/sound';
import { currentVoiceThreshold } from '../lib/noise';
import { BreathIllustration, YouTubeSearch } from '../components/Demo';
import { midiToFreq, noteName, noteNameAr } from '../lib/music';
import { useMic } from '../audio/useMic';
import type { MicFrame } from '../audio/audio';
import { loudnessThreshold, median, SoundTimer, stabilityCents, stabilityRating } from '../lib/stats';
import { addResult } from '../lib/storage';

type Mode = 'sustain' | 'stability' | 'hiss';

const MODES: { id: Mode; ar: string }[] = [
  { id: 'sustain', ar: 'طول النفس' },
  { id: 'stability', ar: 'ثبات الصوت' },
  { id: 'hiss', ar: 'تمرين سسسس' },
];

export function BreathPage() {
  const [mode, setMode] = useState<Mode>('sustain');
  return (
    <Page tips mic help="breath" title="النفس">
      <div className="choices">
        {MODES.map((m) => (
          <button key={m.id} className={m.id === mode ? 'chip active' : 'chip'} onClick={() => setMode(m.id)}>
            {m.ar}
          </button>
        ))}
      </div>
      {mode === 'sustain' && <Sustain />}
      {mode === 'stability' && <Stability />}
      {mode === 'hiss' && <Hiss />}
    </Page>
  );
}

// "she's singing": a pitch and louder than the room (threshold from the room-noise check, default 0.01)
const voiced = (f: MicFrame) => f.freq !== null && f.rms > currentVoiceThreshold();
const secs = (ms: number) => (ms / 1000).toFixed(1);

/** (a) Hold one note as long as possible. `note` = a suggested comfortable note (MIDI). */
export function Sustain({ note, onResult }: { note?: number; onResult?: (seconds: number) => void } = {}) {
  const timer = useRef(new SoundTimer(400));
  const [ms, setMs] = useState(0);
  const [state, setState] = useState<'idle' | 'listening' | 'done'>('idle');
  const [best, setBest] = useState(0);

  const { frame, error, start, stop } = useMic((f) => {
    if (timer.current.finished) return;
    setMs(timer.current.update(f.t, voiced(f)));
    if (timer.current.finished) {
      stop();
      setState('done');
      const d = timer.current.duration;
      setBest((b) => Math.max(b, d));
      if (d > 1000) {
        addResult('sustain', Math.round(d / 100) / 10);
        onResult?.(Math.round(d / 100) / 10);
      }
    }
  });

  const begin = async () => {
    timer.current = new SoundTimer(400);
    setMs(0);
    if (await start()) setState('listening');
  };

  return (
    <div className="panel center">
      <p className="intro">خدي نفس عميق من بطنك، وبعدين غني نغمة واحدة مريحة "آآآ" على قد ما تقدري بصوت ثابت وهادي.</p>
      <BreathIllustration />
      <YouTubeSearch k="breathing" />
      <ErrorText text={error} />
      {note !== undefined && (
        <p>
          غني النغمة دي: <b dir="ltr">{noteName(note)}</b> ({noteNameAr(note)}){' '}
          <button onClick={() => playNote(midiToFreq(note), 1.5)}>🔊 اسمعيها</button>
        </p>
      )}
      <div className="timer">{secs(ms)}<small> ثانية</small></div>
      {state === 'listening' && (
        <>
          <LiveNote freq={frame?.freq ?? null} />
          <p className="hint">{timer.current.started ? 'كملي… التايمر هيقف لما صوتك يقف' : `ابدئي الغنا وقت ما تكوني ${g('جاهزة', 'جاهز')}`}</p>
          <button className="link" onClick={() => { stop(); setState('idle'); }}>
            إلغاء
          </button>
        </>
      )}
      {state === 'done' && <p className="ok-text">اتحفظ ✔ {best > 0 && `أحسن مرة النهارده: ${secs(best)} ثانية`}</p>}
      {state !== 'listening' && (
        <button className="big" onClick={begin}>
          {state === 'done' ? 'مرة كمان' : 'ابدئي'}
        </button>
      )}
    </div>
  );
}

const STABILITY_MS = 5000;
const SETTLE_MS = 500;

/** (b) Hold a note for 5 seconds and measure how steady it is. */
export function Stability({ onResult }: { onResult?: (sdCents: number) => void } = {}) {
  const startT = useRef<number | null>(null);
  const freqs = useRef<number[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [sd, setSd] = useState<number | null>(null);
  const [state, setState] = useState<'idle' | 'listening' | 'done'>('idle');

  const { frame, error, start, stop } = useMic((f) => {
    if (startT.current === null) {
      if (voiced(f)) startT.current = f.t;
      return;
    }
    const t = f.t - startT.current;
    if (t > SETTLE_MS && f.freq) freqs.current.push(f.freq);
    setElapsed(Math.min(t, STABILITY_MS + SETTLE_MS));
    if (freqs.current.length > 10) setSd(stabilityCents(freqs.current));
    if (t >= STABILITY_MS + SETTLE_MS) {
      startT.current = null;
      stop();
      setState('done');
      const v = stabilityCents(freqs.current);
      setSd(v);
      addResult('stability', Math.round(v * 10) / 10);
      onResult?.(Math.round(v * 10) / 10);
    }
  });

  const begin = async () => {
    startT.current = null;
    freqs.current = [];
    setElapsed(0);
    setSd(null);
    if (await start()) setState('listening');
  };

  const rating = sd !== null ? stabilityRating(sd) : null;

  return (
    <div className="panel center">
      <p className="intro">غني نغمة واحدة مريحة ٥ ثواني من غير ما تهزيها. هنقيس الصوت بيتحرك قد إيه (بالسنت) — كل ما الرقم يصغر كل ما أحسن.</p>
      <YouTubeSearch k="sustain" />
      <ErrorText text={error} />
      {state === 'listening' && (
        <>
          <LiveNote freq={frame?.freq ?? null} />
          <div className="timer">{secs(Math.max(0, STABILITY_MS + SETTLE_MS - elapsed))}<small> ثانية</small></div>
          {startT.current === null && <p className="hint">ابدئي الغنا…</p>}
        </>
      )}
      {sd !== null && (
        <div className="stats">
          <Stat label="الاهتزاز (انحراف معياري)" value={`${sd.toFixed(1)} سنت`} />
          {state === 'done' && rating && <Stat label="التقييم" value={`${'★'.repeat(rating.stars)}${'☆'.repeat(4 - rating.stars)} ${rating.ar}`} />}
        </div>
      )}
      {state === 'done' && <p className="ok-text">اتحفظ ✔</p>}
      {state !== 'listening' && (
        <button className="big" onClick={begin}>
          {state === 'done' ? 'مرة كمان' : 'ابدئي'}
        </button>
      )}
    </div>
  );
}

type HissPhase = 'idle' | 'inhale' | 'hold' | 'hiss' | 'done';
const INHALE_MS = 4000;
const HOLD_MS = 4000;
const HISS_WAIT_MS = 5000; // give up if no hiss starts within this time

/** (c) Guided breathing: inhale 4s, hold 4s (we measure room noise), then a long "ssss". */
export function Hiss({ onResult }: { onResult?: (seconds: number) => void } = {}) {
  const phaseStart = useRef(0);
  const phaseRef = useRef<HissPhase>('idle');
  const quiet = useRef<number[]>([]);
  const threshold = useRef(0.02);
  const timer = useRef(new SoundTimer(400));
  const [phase, setPhase] = useState<HissPhase>('idle');
  const [left, setLeft] = useState(0);
  const [ms, setMs] = useState(0);

  const go = (p: HissPhase, t: number) => {
    phaseRef.current = p;
    phaseStart.current = t;
    setPhase(p);
  };

  const { error, start, stop } = useMic((f) => {
    const p = phaseRef.current;
    const t = f.t - phaseStart.current;
    if (p === 'inhale') {
      setLeft(INHALE_MS - t);
      if (t >= INHALE_MS) go('hold', f.t);
    } else if (p === 'hold') {
      setLeft(HOLD_MS - t);
      if (t > 500) quiet.current.push(f.rms);
      if (t >= HOLD_MS) {
        threshold.current = loudnessThreshold(median(quiet.current));
        timer.current = new SoundTimer(400);
        go('hiss', f.t);
      }
    } else if (p === 'hiss') {
      setMs(timer.current.update(f.t, f.rms > threshold.current));
      if (timer.current.finished || (!timer.current.started && t > HISS_WAIT_MS)) {
        go('done', f.t);
        stop();
        if (timer.current.duration > 1000) {
          addResult('hiss', Math.round(timer.current.duration / 100) / 10);
          onResult?.(Math.round(timer.current.duration / 100) / 10);
        }
      }
    }
  });

  const begin = async () => {
    quiet.current = [];
    setMs(0);
    if (await start()) go('inhale', performance.now());
  };

  const cancel = () => {
    stop();
    go('idle', 0);
  };

  const label: Record<HissPhase, string> = {
    idle: '',
    inhale: 'خدي نفس من مناخيرك… بطنك تنفخ',
    hold: 'اكتمي نفسك… (في هدوء)',
    hiss: 'طلعي "سسسسس" بالراحة وبانتظام',
    done: 'خلصنا!',
  };

  return (
    <div className="panel center">
      <p className="intro">تمرين التحكم في الزفير: شهيق ٤ ثواني، كتم ٤ ثواني، وبعدين "سسسس" طويلة وهادية. الميكروفون بيقيس السسس استمرت قد إيه.</p>
      <BreathIllustration />
      <YouTubeSearch k="hiss" />
      <ErrorText text={error} />
      {phase !== 'idle' && (
        <div className={'breath-circle ' + phase}>
          <span>{label[phase]}</span>
        </div>
      )}
      {(phase === 'inhale' || phase === 'hold') && <div className="timer">{Math.max(0, Math.ceil(left / 1000))}</div>}
      {(phase === 'hiss' || phase === 'done') && (
        <div className="timer">
          {secs(ms)}
          <small> ثانية</small>
        </div>
      )}
      {phase === 'done' && <p className={ms > 1000 ? 'ok-text' : 'hint'}>{ms > 1000 ? 'اتحفظ ✔' : 'مسمعناش سسسس كفاية. قربي من الميكروفون وجربي تاني.'}</p>}
      {phase === 'idle' || phase === 'done' ? (
        <button className="big" onClick={begin}>
          {phase === 'done' ? 'مرة كمان' : 'ابدئي'}
        </button>
      ) : (
        <button className="link" onClick={cancel}>
          إلغاء
        </button>
      )}
    </div>
  );
}
