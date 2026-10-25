import { useRef, useState } from 'react';
import { ErrorText, Page, Stat } from '../components/ui';
import { useMic } from '../audio/useMic';
import { playNote } from '../audio/sound';
import { DYNAMICS_KINDS, loudHighWarning, scoreDynamics, targetShape, toDb, type DynamicsKind, type DynamicsScore, type DynFrame } from '../lib/dynamics';
import { centsBetween, midiToFreq, noteNameAr } from '../lib/music';
import { currentVoiceThreshold } from '../lib/noise';
import { addResult } from '../lib/storage';
import { exerciseRange } from './common';

const W = 320;
const H = 120;

/** Two lines over time: loudness (top) with the target shape dashed, pitch around her own note (bottom). */
function DynGraph({ frames, kind, seconds }: { frames: DynFrame[]; kind: DynamicsKind; seconds: number }) {
  const voiced = frames.filter((f) => f.freq !== null);
  const x = (t: number) => (t / seconds) * W;
  const target = Array.from({ length: 41 }, (_, i) => `${(i / 40) * W},${H - 10 - targetShape(kind, i / 40) * (H - 20)}`).join(' ');
  const dbs = voiced.map((f) => toDb(f.rms));
  const lo = Math.min(-50, ...dbs);
  const hi = Math.max(-5, ...dbs);
  const loud = voiced.map((f) => `${x(f.t)},${H - 10 - ((toDb(f.rms) - lo) / (hi - lo)) * (H - 20)}`).join(' ');
  const mid = voiced.length ? voiced.map((f) => f.freq!).sort((a, b) => a - b)[Math.floor(voiced.length / 2)] : 440;
  const pitch = voiced.map((f) => `${x(f.t)},${H / 2 - Math.max(-60, Math.min(60, centsBetween(f.freq!, mid))) * (H / 130)}`).join(' ');
  return (
    <div className="dyn-graphs" dir="ltr">
      <p className="hint">العلو (المتقطع = المطلوب)</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="dyn-svg" role="img" aria-label="خط العلو">
        <polyline points={target} className="dyn-target" />
        <polyline points={loud} className="dyn-loud" />
      </svg>
      <p className="hint">النغمة (الخط النص = نغمتك؛ فوق وتحت = اهتزاز)</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="dyn-svg" role="img" aria-label="خط النغمة">
        <line x1={0} x2={W} y1={H / 2} y2={H / 2} className="dyn-mid" />
        <polyline points={pitch} className="dyn-pitch" />
      </svg>
    </div>
  );
}

/** "🎚️ العالي والواطي": louder / softer on one steady note. */
export function DynamicsPage() {
  const range = useRef(exerciseRange()).current;
  const [kind, setKind] = useState<DynamicsKind>('cresc');
  const [midi, setMidi] = useState(() => Math.round((range.low + range.high) / 2) - 2);
  const [phase, setPhase] = useState<'idle' | 'rec'>('idle');
  const [frames, setFrames] = useState<DynFrame[]>([]);
  const [score, setScore] = useState<DynamicsScore | null>(null);
  const [none, setNone] = useState(false);
  const rec = useRef({ frames: [] as DynFrame[], t0: 0, on: false });
  const info = DYNAMICS_KINDS.find((k) => k.id === kind)!;

  const done = () => {
    const r = rec.current;
    r.on = false;
    stop();
    setPhase('idle');
    setFrames(r.frames);
    const s = scoreDynamics(r.frames, kind);
    setScore(s);
    setNone(!s);
    if (s) addResult('dynamics', s.total, `${info.ar} — علو ${s.loudness}٪، ثبات ${s.pitch}٪`);
  };

  const { frame, error, start, stop } = useMic((f) => {
    const r = rec.current;
    if (!r.on) return;
    const t = (f.t - r.t0) / 1000;
    r.frames.push({ t, rms: f.rms, freq: f.freq && f.rms > currentVoiceThreshold() * 0.5 ? f.freq : null });
    if (t >= info.seconds) done();
  });

  const go = async () => {
    setScore(null);
    setNone(false);
    setFrames([]);
    await playNote(midiToFreq(midi), 1.2);
    if (!(await start())) return;
    rec.current = { frames: [], t0: performance.now(), on: true };
    setPhase('rec');
  };

  const elapsed = phase === 'rec' && frame ? Math.min(1, (frame.t - rec.current.t0) / 1000 / info.seconds) : 0;
  const nearTop = loudHighWarning(midi, range.high);

  return (
    <Page tips mic help="dynamics" title="🎚️ العالي والواطي" intro="نفس النغمة، بس الصوت بيعلى أو بيوطى بالراحة — والنغمة نفسها متتهزش.">
      <div className="panel">
        <div className="choices">
          {DYNAMICS_KINDS.map((k) => (
            <button key={k.id} className={k.id === kind ? 'chip active' : 'chip'} disabled={phase === 'rec'} onClick={() => setKind(k.id)}>
              {k.ar}
            </button>
          ))}
        </div>
        <p className="hint">
          {info.what} ({info.seconds} ثواني)
        </p>
        <div className="row note-pick">
          <button onClick={() => setMidi((m) => Math.max(range.low, m - 1))} disabled={phase === 'rec'} aria-label="أوطى">
            −
          </button>
          <b>{noteNameAr(midi)}</b>
          <button onClick={() => setMidi((m) => Math.min(range.high, m + 1))} disabled={phase === 'rec'} aria-label="أعلى">
            +
          </button>
          <button onClick={() => void playNote(midiToFreq(midi), 1.2)} disabled={phase === 'rec'}>
            🔊 اسمعي النغمة
          </button>
        </div>
        {nearTop && <p className="warn-text">⚠️ النغمة دي في أعلى صوتك — خليها هادية ومتعليش أوي عليها، أو انزلي نغمتين. الصوت العالي على النغم العالية بيتعب الحبال الصوتية.</p>}
        {phase === 'rec' ? (
          <div className="dyn-live">
            <div className="dyn-guide">
              <span style={{ insetInlineStart: `${elapsed * 100}%` }} />
            </div>
            <p>
              {kind === 'cresc' ? 'علّي بالراحة…' : kind === 'decresc' ? 'وطّي بالراحة…' : elapsed < 0.5 ? 'علّي بالراحة…' : 'ووطّي تاني…'} (المطلوب دلوقتي: {Math.round(targetShape(kind, elapsed) * 100)}٪)
            </p>
          </div>
        ) : (
          <button className="big primary" onClick={go}>
            {score ? '🔁 تاني' : '🎤 ابدئي'}
          </button>
        )}
        <ErrorText text={error} />
        {none && <p className="error">مسمعناش صوت كفاية — غني النغمة طول الوقت، حتى في الحتة الهادية.</p>}
      </div>
      {score && (
        <div className="panel">
          <div className="stats">
            <Stat label="نعومة العلو" value={`${score.loudness}%`} />
            <Stat label="ثبات النغمة" value={`${score.pitch}%`} />
            <Stat label="النتيجة" value={`${score.total}%`} />
          </div>
          <p className="hint">
            الفرق بين أوطى وأعلى: {score.rangeDb} ديسيبل{score.rangeDb < 10 ? ' — جربي فرق أكبر بين الهادي والعالي.' : '.'} الاهتزاز: ±{score.sdCents} سنت
            {score.pitch < 70 ? ' — النغمة بتتحرك لما الصوت بيعلى؛ ركزي إنها تفضل في مكانها.' : '.'}
          </p>
          {loudHighWarning(midi, range.high, score.peakDb) && <p className="warn-text">⚠️ علّيتي جامد على نغمة عالية — المرة الجاية خليها أهدى.</p>}
          <DynGraph frames={frames} kind={kind} seconds={info.seconds} />
        </div>
      )}
    </Page>
  );
}
