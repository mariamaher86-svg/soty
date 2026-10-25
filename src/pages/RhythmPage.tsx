import { useEffect, useRef, useState } from 'react';
import { ErrorText, Options, Page, Stat } from '../components/ui';
import { LessonLink } from '../components/LessonLink';
import { useMic } from '../audio/useMic';
import { audioContext } from '../audio/audio';
import { startMetronome, type Metronome } from '../audio/metronome';
import { calibrateLatency, detectOnsets, onsetThreshold, patternTimes, RHYTHM_PATTERNS, timingScore, timingWords, type Timing } from '../lib/rhythm';
import { addResult, getPref, setPref } from '../lib/storage';

const AR_DIGITS = ['١', '٢', '٣', '٤', '٥', '٦'];
const savedLatency = () => {
  const v = Number(getPref('rhythm.latency'));
  return Number.isFinite(v) && getPref('rhythm.latency') !== null ? v : null;
};

/** Mic loudness frames on the AudioContext clock (same clock as the clicks). */
function useOnsetRecorder() {
  const frames = useRef<{ t: number; rms: number }[]>([]);
  const recording = useRef(false);
  const mic = useMic((f) => {
    if (recording.current) frames.current.push({ t: audioContext().currentTime, rms: f.rms });
  });
  const begin = async () => {
    frames.current = [];
    if (!(await mic.start())) return false;
    recording.current = true;
    return true;
  };
  const end = () => {
    recording.current = false;
    mic.stop();
    const f = frames.current;
    return detectOnsets(f, onsetThreshold(f.map((x) => x.rms)));
  };
  return { begin, end, error: mic.error };
}

function MetronomePanel() {
  const [bpm, setBpm] = useState(() => Number(getPref('rhythm.bpm') ?? 80));
  const [perBar, setPerBar] = useState(4);
  const [beat, setBeat] = useState(-1);
  const [running, setRunning] = useState(false);
  const met = useRef<Metronome | null>(null);
  const stop = () => {
    met.current?.stop();
    met.current = null;
    setBeat(-1);
    setRunning(false);
  };
  useEffect(() => stop, []);
  const toggle = () => {
    if (met.current) return stop();
    audioContext();
    met.current = startMetronome({ bpm, beatsPerBar: perBar, onBeat: (b) => setBeat(b.index % perBar) });
    setRunning(true);
  };
  const change = (b: number, p: number) => {
    setBpm(b);
    setPerBar(p);
    setPref('rhythm.bpm', String(b));
    if (met.current) {
      met.current.stop();
      met.current = startMetronome({ bpm: b, beatsPerBar: p, onBeat: (x) => setBeat(x.index % p) });
    }
  };
  return (
    <div className="panel">
      <h2>🥁 المترونوم</h2>
      <p className="hint">ضربة كل عدّة، والضربة الأولى في كل مازورة أعلى.</p>
      <label className="slider-row">
        <span>السرعة: {bpm} ضربة في الدقيقة</span>
        <input type="range" min={40} max={200} step={2} value={bpm} onChange={(e) => change(Number(e.target.value), perBar)} />
      </label>
      <div className="choices">
        {[2, 3, 4].map((p) => (
          <button key={p} className={p === perBar ? 'chip active' : 'chip'} onClick={() => change(bpm, p)}>
            {AR_DIGITS[p - 1]} في المازورة
          </button>
        ))}
      </div>
      <div className="beat-dots" aria-hidden>
        {Array.from({ length: perBar }, (_, i) => (
          <span key={i} className={(i === beat ? 'on ' : '') + (i === 0 ? 'first' : '')} />
        ))}
      </div>
      <button className="big" onClick={toggle}>
        {running ? '⏹ وقفي المترونوم' : '▶️ شغّلي المترونوم'}
      </button>
    </div>
  );
}

function CalibratePanel({ latency, onChange }: { latency: number | null; onChange: (v: number) => void }) {
  const [state, setState] = useState<'idle' | 'run' | 'fail'>('idle');
  const [beat, setBeat] = useState(-1);
  const rec = useOnsetRecorder();
  const run = async () => {
    if (!(await rec.begin())) return;
    setState('run');
    const bpm = 90;
    const m = startMetronome({
      bpm,
      beatsPerBar: 4,
      maxBeats: 12,
      onBeat: (b) => setBeat(b.index),
      onEnd: () =>
        window.setTimeout(() => {
          const onsets = rec.end();
          const clicks = patternTimes([0, 1, 2, 3], m.start + (4 * 60) / bpm, bpm, 2); // the 8 clicks after the first bar
          const r = calibrateLatency(onsets, clicks);
          setBeat(-1);
          if (!r) return setState('fail');
          setPref('rhythm.latency', r.offset.toFixed(3));
          onChange(r.offset);
          setState('idle');
        }, 400),
    });
  };
  return (
    <div className="panel">
      <h2>🎯 ظبط التأخير</h2>
      <p className="hint">الموبايل بيتأخر شوية في السماع والتسجيل. صقّفي مع الضربات ١٢ ضربة، والتطبيق يحسب التأخير ويطرحه من نتايجك.</p>
      {latency !== null && <Stat label="التأخير المحفوظ" value={`${Math.round(latency * 1000)} ملي ثانية`} />}
      {state === 'run' ? (
        <p className="count-big">{beat < 4 ? 'اسمعي…' : `👏 ${AR_DIGITS[beat % 4]}`}</p>
      ) : (
        <button className={latency === null ? 'big primary' : 'big'} onClick={run}>
          {latency === null ? '👏 ظبطي التأخير' : '👏 ظبطي التأخير تاني'}
        </button>
      )}
      {state === 'fail' && <p className="error">مسمعناش تصقيف كفاية — صقّفي جامد مع كل ضربة وجربي تاني.</p>}
      <ErrorText text={rec.error} />
    </div>
  );
}

/** Clap or say "تا" on the pattern after a count-in. `onResult` = beginner path mode. */
export function RhythmPage({ onResult }: { onResult?: (score: number) => void } = {}) {
  const [latency, setLatency] = useState(savedLatency);
  const [patternId, setPatternId] = useState('quarters');
  const [bpm, setBpm] = useState(70);
  const [clicksOn, setClicksOn] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'count' | 'play'>('idle');
  const [beat, setBeat] = useState(-1);
  const [timing, setTiming] = useState<Timing | null>(null);
  const met = useRef<Metronome | null>(null);
  const rec = useOnsetRecorder();
  const pattern = RHYTHM_PATTERNS.find((p) => p.id === patternId)!;
  useEffect(() => () => met.current?.stop(), []);

  const go = async () => {
    if (!(await rec.begin())) return;
    setTiming(null);
    setPhase('count');
    const beatS = 60 / bpm;
    const m = startMetronome({
      bpm,
      beatsPerBar: 4,
      delay: 0.5,
      maxBeats: 12, // count-in bar + 2 bars
      audible: (i) => i < 4 || clicksOn,
      onBeat: (b) => {
        setBeat(b.index);
        setPhase(b.index < 4 ? 'count' : 'play');
      },
      onEnd: () =>
        window.setTimeout(() => {
          const onsets = rec.end();
          const first = m.start + 4 * beatS;
          const expected = patternTimes(pattern.beats, first, bpm, 2);
          const gaps = pattern.beats.slice(1).map((x, i) => x - pattern.beats[i]);
          const step = Math.min(1, ...gaps) * beatS;
          const window_ = Math.min(0.3, step * 0.5);
          const lat = latency ?? 0;
          const mine = onsets.filter((o) => o - lat >= first - window_); // the count-in clicks don't count
          const t = timingScore(mine, expected, lat, window_);
          setTiming(t);
          setPhase('idle');
          setBeat(-1);
          addResult('rhythm', t.score, `${pattern.ar} — ${bpm}`);
          onResult?.(t.score);
        }, 500),
    });
    met.current = m;
  };

  const errs = timing?.errors.filter((e): e is number => e !== null) ?? [];
  const avg = errs.length ? errs.reduce((a, b) => a + b, 0) / errs.length : null;

  return (
    <Page
      tips
      help="rhythm"
      title="🥁 الإيقاع"
      intro="صقّفي أو قولي «تا» على الضربة. الأول ٤ عدّات تسمعيها (١، ٢، ٣، ٤ — ادخلي)، وبعدين مازورتين."
    >
      <LessonLink id="rhythm" what="ضربة ومازورة" />
      {latency === null && <p className="hint">⚠️ ابدئي بـ «👏 ظبطي التأخير» تحت مرة واحدة — من غيره النتايج على الموبايل هتطلع متأخرة.</p>}
      <div className="panel">
        <h2>👏 صقّفي الإيقاع</h2>
        <div className="choices">
          {RHYTHM_PATTERNS.map((p) => (
            <button key={p.id} className={p.id === patternId ? 'chip active' : 'chip'} onClick={() => setPatternId(p.id)} disabled={phase !== 'idle'}>
              <span className="rhythm-symbols" dir="ltr">
                {p.symbols}
              </span>{' '}
              {p.ar}
            </button>
          ))}
        </div>
        <p className="hint">♩ = ضربة في العدّة، ♫ = ضربتين في العدّة، 𝄽 = سكتة (متصقّفيش).</p>
        <Options label={`خيارات: السرعة ${bpm}`}>
          <label className="slider-row">
            <span>السرعة: {bpm}</span>
            <input type="range" min={50} max={140} step={5} value={bpm} disabled={phase !== 'idle'} onChange={(e) => setBpm(Number(e.target.value))} />
          </label>
          <label className="check-row">
            <input type="checkbox" checked={clicksOn} onChange={(e) => setClicksOn(e.target.checked)} />
            الضربات تكمّل وأنا بصقّف (بالسماعات بس — من غيرها المايك هيسمعها)
          </label>
        </Options>
        <div className="rhythm-stage" dir="ltr">
          {phase === 'count' && <span className="count-big">{beat < 0 ? '…' : beat < 3 ? AR_DIGITS[beat] : `${AR_DIGITS[3]} — ادخلي`}</span>}
          {phase === 'play' && (
            <span className="count-big">
              {pattern.symbols.split(' ').map((s, i) => (
                <span key={i} className={i === (beat - 4) % 4 ? 'now' : ''}>
                  {s}{' '}
                </span>
              ))}
            </span>
          )}
        </div>
        {phase === 'idle' && (
          <button className="big primary" onClick={go}>
            {timing ? '🔁 تاني' : '▶️ ابدئي'}
          </button>
        )}
        <ErrorText text={rec.error} />
        {timing && (
          <div className="rhythm-result">
            <Stat label="النتيجة" value={`${timing.score}%`} />
            {avg !== null && Math.abs(avg) > 0.04 && <p>{avg < 0 ? 'في المتوسط بتسبقي الضربة' : 'في المتوسط بتتأخري عن الضربة'} — {timingWords(avg)}.</p>}
            <ol className="rhythm-list">
              {timing.errors.map((e, i) => (
                <li key={i} className={e === null ? 'miss' : Math.abs(e) <= 0.04 ? 'ok' : ''}>
                  {timingWords(e)}
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
      <CalibratePanel latency={latency} onChange={setLatency} />
      <MetronomePanel />
    </Page>
  );
}
