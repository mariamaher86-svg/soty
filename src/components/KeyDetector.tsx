// "اكتشف المقام": listen to a song (from a speaker) or her singing, then suggest the likely key/maqam.

import { useRef, useState } from 'react';
import { ErrorText, LiveNote, Stat } from './ui';
import { useMic } from '../audio/useMic';
import { playNote } from '../audio/sound';
import { detectKey, histogramFromFrames, histogramSeconds, keyLabel, pitchClassCents, type KeyCandidate, type KeyFrame } from '../lib/keyDetect';
import { SCALES, tonicName } from '../lib/scale';
import { midiToFreq, shiftCents } from '../lib/music';
import { steadySegment } from '../lib/samples';
import { inUserOctave } from '../lib/voice';
import { exerciseRange } from '../pages/common';

const MAX_SECONDS = 45;
const GOOD_SECONDS = 20;
const HINT_SECONDS = 4;

const CONFIDENCE_AR = { high: 'ثقة عالية', medium: 'ثقة متوسطة', low: 'ثقة ضعيفة' };

export function KeyNotes() {
  return (
    <div className="notes" role="note">
      <b>تنبيهات:</b>
      <ul>
        <li>بيشتغل كويس مع الأغاني الغربي (ماجير ومينور).</li>
        <li>مع المقامات العربي ده تقدير بس، خصوصًا بين المقامات القريبة من بعض (زي بياتي وكرد، أو راست وعجم) — اتأكدي بودنك.</li>
        <li>التسجيل ممكن يكون متعلّى أو متوطّى عن ورقة الكوردات، فالقرار ممكن يطلع مختلف عن المكتوب.</li>
        <li>سماعة (مش سماعات ودن) وأوضة هادية بيدّوا نتيجة أحسن.</li>
      </ul>
    </div>
  );
}

/** Plays a candidate's scale upwards on the piano, around the middle of the voice. */
async function playScale(c: KeyCandidate) {
  const scale = SCALES.find((s) => s.id === c.scaleIds[0])!;
  // in the user's own octave: the whole scale (tonic .. octave) inside their comfortable range when possible
  const r = exerciseRange();
  const base = inUserOctave(60 + c.tonic, r.low, r.high - 12 >= r.low ? r.high - 12 : r.high);
  for (const cents of scale.up) await playNote(shiftCents(midiToFreq(base), cents), 0.55, 'piano');
}

export function KeyDetector({ onUse }: { onUse: (tonic: number, scaleId: string) => void }) {
  const [phase, setPhase] = useState<'idle' | 'listening' | 'hint'>('idle');
  const [seconds, setSeconds] = useState(0);
  const [results, setResults] = useState<KeyCandidate[] | null>(null);
  const [hint, setHint] = useState<number | null>(null);
  const [hintLeft, setHintLeft] = useState(0);
  const [msg, setMsg] = useState('');
  const frames = useRef<KeyFrame[]>([]);
  const hintFrames = useRef<{ t: number; freq: number | null }[]>([]);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const startT = useRef(0);
  const lastUpdate = useRef(0);

  const analyse = (h: number | null = hint) => {
    const hist = histogramFromFrames(frames.current);
    const secs = histogramSeconds(hist);
    setSeconds(secs);
    setResults(secs > 2 ? detectKey(hist, h) : null);
  };

  const { frame, error, start, stop } = useMic((f) => {
    const t = f.t / 1000;
    if (phaseRef.current === 'listening') {
      frames.current.push({ t, freq: f.freq, clarity: f.clarity });
      if (t - lastUpdate.current > 1) {
        lastUpdate.current = t;
        analyse();
      }
      if (t - startT.current > MAX_SECONDS) finishListening();
    } else if (phaseRef.current === 'hint') {
      hintFrames.current.push({ t, freq: f.freq });
      const left = HINT_SECONDS - (t - startT.current);
      setHintLeft(Math.max(0, left));
      if (left <= 0) finishHint();
    }
  }, 0.8);

  const listen = async () => {
    setMsg('');
    frames.current = [];
    setResults(null);
    setSeconds(0);
    startT.current = performance.now() / 1000;
    if (await start()) setPhase('listening');
  };

  function finishListening() {
    phaseRef.current = 'idle';
    setPhase('idle');
    stop();
    analyse();
  }

  const listenHint = async () => {
    setMsg('');
    hintFrames.current = [];
    startT.current = performance.now() / 1000;
    if (await start()) setPhase('hint');
  };

  function finishHint() {
    phaseRef.current = 'idle';
    setPhase('idle');
    stop();
    const seg = steadySegment(hintFrames.current, 40, 0.5);
    if (!seg) return setMsg('مسمعناش نغمة ثابتة. غنّي أو شغّلي آخر نغمة في الأغنية ممدودة، وجرّبي تاني.');
    setHint(seg.freq);
    analyse(seg.freq);
  }

  const hintName = hint !== null ? tonicName((Math.round(pitchClassCents(hint) / 50) % 24) / 2) : null;

  return (
    <div className="panel">
      <h2>🔎 اكتشف المقام</h2>
      <KeyNotes />
      <ErrorText text={error} />
      <p className="hint">
        شغّلي الأغنية من سماعة (من غير سماعات ودن) أو غنّيها إنتي، ٢٠–٤٠ ثانية. هنسمع النغمات ونقولك أقرب سلم أو مقام.
      </p>

      {phase === 'listening' ? (
        <div className="center">
          <LiveNote freq={frame?.freq ?? null} />
          <Stat label="ثواني نغمات واضحة" value={`${Math.round(seconds)} / ${GOOD_SECONDS}`} />
          <button className="big" onClick={finishListening}>
            ⏹ كفاية
          </button>
        </div>
      ) : phase === 'hint' ? (
        <div className="center">
          <p className="guide">غنّي أو شغّلي النغمة اللي الأغنية بتخلص عليها وامدّيها…</p>
          <LiveNote freq={frame?.freq ?? null} />
          <div className="timer">{hintLeft.toFixed(1)}</div>
        </div>
      ) : (
        <div className="row">
          <button className="big primary" onClick={listen}>
            🎧 {results ? 'اسمعي من الأول' : 'ابدئي الاستماع'}
          </button>
          <button onClick={listenHint}>🎯 النغمة اللي الأغنية بتخلص عليها (اختياري)</button>
        </div>
      )}

      {msg && <p className="hint">{msg}</p>}
      {hintName && (
        <p className="hint">
          نغمة النهاية: <b dir="ltr">{hintName.name}</b> ({hintName.ar}) — بنديها وزن كبير كقرار.{' '}
          <button
            className="link"
            onClick={() => {
              setHint(null);
              analyse(null);
            }}
          >
            شيليها
          </button>
        </p>
      )}

      {results && (
        <>
          {seconds < GOOD_SECONDS && phase !== 'listening' && <p className="hint">سمعنا {Math.round(seconds)} ثانية بس — النتيجة هتبقى أدق لو سمعنا ٢٠ ثانية أو أكتر.</p>}
          <ol className="key-results">
            {results.map((c, i) => {
              const l = keyLabel(c);
              return (
                <li key={i}>
                  <div>
                    <b>{i === 0 ? 'الأقرب: ' : ''}{l.ar}</b> <span dir="ltr">({l.en})</span> — {CONFIDENCE_AR[c.confidence]}{' '}
                    <small className="hint">{Math.round(c.probability * 100)}%</small>
                  </div>
                  <div className="row">
                    <button onClick={() => playScale(c)}>🔊 اسمعي السلم</button>
                    <button className="primary" onClick={() => onUse(c.tonic, c.scaleIds[0])}>
                      استخدمه
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </div>
  );
}
