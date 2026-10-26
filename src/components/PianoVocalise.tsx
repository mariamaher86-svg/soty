// "🎶 فوكاليز" on the piano page: pick a pattern and a starting key, listen to it on the keyboard, then sing it back
// note by note (each note ✔ or ✘ with its cents), with up/down a semitone and an optional auto-climb.

import { useEffect, useRef, useState } from 'react';
import { CentsMeter, ErrorText, Options, Stat } from './ui';
import { Help } from './Help';
import { PianoKeyboard } from './PianoKeyboard';
import { OctaveHint } from './OctaveHint';
import { useMic } from '../audio/useMic';
import { playNote } from '../audio/sound';
import { playSuccess } from '../audio/chime';
import { centsToTarget, keyLabel, nearestKey, toKeyQuarter, type LabelStyle } from '../lib/keyboard';
import { MAQAMAT } from '../lib/maqam';
import { midiToFreq, noteName, quarterToneName } from '../lib/music';
import { VOCALISES } from '../lib/vocalise';
import {
  defaultStart,
  followStep,
  nextClimb,
  offWords,
  patternSteps,
  patternTop,
  roundScore,
  startFollow,
  STEP_TOLERANCE,
  TEMPOS,
  type ClimbDir,
  type FollowState,
  type PatternSource,
  type RoundScore,
  type TempoId,
} from '../lib/pianoVocalise';
import { addResult, getPref, setPref } from '../lib/storage';

type Phase = 'idle' | 'listen' | 'ref' | 'sing' | 'result';

const nameOf = (midi: number) => (Number.isInteger(midi) ? `${keyLabel(midi, 'solfege').main} ${noteName(midi)}` : `${quarterToneName(midi).ar} ${quarterToneName(midi).name}`);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function PianoVocalise({ labels, zoom, range }: { labels: LabelStyle; zoom: boolean; range: { low: number; high: number; fromTest: boolean } }) {
  const [kind, setKind] = useState<'vocalise' | 'maqam'>(() => (getPref('pv.kind') === 'maqam' ? 'maqam' : 'vocalise'));
  const [vocId, setVocId] = useState(() => getPref('pv.vocalise') ?? 'five');
  const [maqamId, setMaqamId] = useState(() => getPref('pv.maqam') ?? 'rast');
  const [tempo, setTempo] = useState<TempoId>(() => (getPref('pv.tempo') as TempoId) || 'medium');
  const [climb, setClimb] = useState(() => getPref('pv.climb') === '1');
  const [start, setStart] = useState(() => defaultStart(range.low));
  const [phase, setPhase] = useState<Phase>('idle');
  const [playIndex, setPlayIndex] = useState(-1);
  const [follow, setFollow] = useState<FollowState>(startFollow);
  const [score, setScore] = useState<RoundScore | null>(null);
  const [note, setNote] = useState('');
  const run = useRef({ phase: 'idle' as Phase, follow: startFollow(), last: 0, cancel: 0, dir: 'up' as ClimbDir });
  const raw = useRef<number[]>([]);

  const src: PatternSource = kind === 'maqam' ? { kind: 'maqam', maqam: MAQAMAT.find((m) => m.id === maqamId)! } : { kind: 'vocalise', id: vocId };
  const steps = patternSteps(src, start);
  const top = patternTop(steps, start);
  const factor = TEMPOS.find((t) => t.id === tempo)!.factor;
  const label = kind === 'maqam' ? `مقام ${MAQAMAT.find((m) => m.id === maqamId)!.ar}` : VOCALISES.find((v) => v.id === vocId)!.ar;

  const go = (p: Phase) => {
    run.current.phase = p;
    setPhase(p);
  };

  const {
    frame,
    error,
    start: startMic,
    stop: stopMic,
  } = useMic((f) => {
    const r = run.current;
    const dt = r.last ? f.t - r.last : 0;
    r.last = f.t;
    if (r.phase !== 'sing') return;
    const step = steps[r.follow.index];
    if (!step) return;
    const { key, quarter } = toKeyQuarter(step.midi);
    const c = f.freq ? centsToTarget(f.freq, key, quarter) : null;
    if (c !== null) raw.current = [...raw.current.slice(-39), c];
    const before = r.follow.results.length;
    r.follow = followStep(r.follow, steps, c, dt);
    if (r.follow.results.length > before) raw.current = [];
    if (r.follow.results.length > before && r.follow.results[before].ok) playSuccess();
    setFollow(r.follow);
    if (r.follow.done) finishRound();
  });

  useEffect(
    () => () => {
      run.current.cancel++;
      stopMic();
    },
    [],
  );

  /** play the pattern on the piano, lighting each key */
  const listen = async (from = start) => {
    const token = ++run.current.cancel;
    go('listen');
    const s = patternSteps(src, from);
    for (let i = 0; i < s.length; i++) {
      if (run.current.cancel !== token) return false;
      setPlayIndex(i);
      await playNote(midiToFreq(s[i].midi), s[i].dur * factor);
      if (s[i].staccato) await wait(180 * factor);
    }
    setPlayIndex(-1);
    if (run.current.cancel !== token) return false;
    go('idle');
    return true;
  };

  /** "🎤 دورك": one reference note, then follow her note by note */
  const sing = async (from = start) => {
    const token = ++run.current.cancel;
    if (!(await startMic())) return;
    setScore(null);
    setNote('');
    raw.current = [];
    run.current.follow = startFollow();
    setFollow(run.current.follow);
    go('ref');
    const first = patternSteps(src, from)[0];
    await playNote(midiToFreq(first.midi), 0.9);
    await wait(250);
    if (run.current.cancel !== token) return;
    run.current.last = 0;
    go('sing');
  };

  const finishRound = () => {
    const r = run.current;
    go('result');
    const sc = roundScore(r.follow.results);
    setScore(sc);
    const offText = sc.off.map((o) => `${noteName(Math.round(steps[o.index].midi))} ${offWords(o.cents)}`).join('، ');
    addResult('piano-vocalise', sc.percent, `${label} من ${noteName(start)} — ${sc.ok}/${sc.total}${offText ? ` (✘ ${offText})` : ''}`);
    if (!climb) return;
    const n = nextClimb(start, top, range.low, range.high, r.dir, sc.percent);
    r.dir = n.dir;
    if (n.finished) {
      setNote('👏 خلصنا الطلوع والنزول في المنطقة المريحة.');
      return;
    }
    if (n.start === start) {
      setNote('نعيدها على نفس الطبقة.');
    } else setNote(n.start > start ? '⬆ طالعين نص تون…' : '⬇ نازلين نص تون…');
    const token = r.cancel;
    setStart(n.start);
    void (async () => {
      await wait(1500);
      if (run.current.cancel !== token) return;
      if (await listen(n.start)) await sing(n.start);
    })();
  };

  const stopAll = () => {
    run.current.cancel++;
    stopMic();
    setPlayIndex(-1);
    go(score ? 'result' : 'idle');
  };

  const move = (by: number) => {
    run.current.cancel++;
    setStart((s) => Math.max(36, Math.min(96 - top, s + by)));
    setScore(null);
    setNote('');
    go('idle');
  };

  const pick = (midi: number) => {
    if (phase === 'listen' || phase === 'ref' || phase === 'sing') return;
    setStart(Math.min(midi, 96 - top));
    setScore(null);
    setNote('');
    go('idle');
    void playNote(midiToFreq(midi), 0.8);
  };

  const busy = phase === 'listen' || phase === 'ref' || phase === 'sing';
  const shownStep = phase === 'listen' ? steps[playIndex] : phase === 'sing' || phase === 'ref' ? steps[phase === 'ref' ? 0 : follow.index] : steps[0];
  const shown = shownStep ? toKeyQuarter(shownStep.midi) : null;
  const freq = frame?.freq ?? null;
  const sung = phase === 'sing' && freq ? nearestKey(freq) : null;
  const liveCents = phase === 'sing' && freq && shown ? centsToTarget(freq, shown.key, shown.quarter) : null;
  const outsideTop = start + top > range.high;

  return (
    <>
      <div className="panel">
        <div className="page-head">
          <h2>🎶 فوكاليز على البيانو</h2>
          <Help id="piano-vocalise" />
        </div>
        <div className="choices" role="group" aria-label="التمرين">
          {VOCALISES.map((v) => (
            <button
              key={v.id}
              disabled={busy}
              className={kind === 'vocalise' && v.id === vocId ? 'chip active' : 'chip'}
              onClick={() => {
                setKind('vocalise');
                setVocId(v.id);
                setPref('pv.kind', 'vocalise');
                setPref('pv.vocalise', v.id);
                setScore(null);
              }}
            >
              {v.ar}
            </button>
          ))}
          <button
            disabled={busy}
            className={kind === 'maqam' ? 'chip active' : 'chip'}
            onClick={() => {
              setKind('maqam');
              setPref('pv.kind', 'maqam');
              setScore(null);
            }}
          >
            🎼 سلم مقام
          </button>
        </div>
        {kind === 'maqam' && (
          <div className="choices" role="group" aria-label="المقام">
            {MAQAMAT.map((m) => (
              <button
                key={m.id}
                disabled={busy}
                className={m.id === maqamId ? 'chip active' : 'chip'}
                onClick={() => {
                  setMaqamId(m.id);
                  setPref('pv.maqam', m.id);
                  setScore(null);
                }}
              >
                {m.ar}
              </button>
            ))}
          </div>
        )}
        <p className="hint">
          البداية: <b dir="auto">{nameOf(start)}</b> — دوسي على أي مفتاح عشان تغيّريها.
        </p>
        {outsideTop && <p className="warn-text">آخر نغمة في التمرين ده ({nameOf(start + top)}) فوق المنطقة المريحة لصوتك — غنّيها بهدوء أو انزلي نص تون.</p>}
        <Options label={`خيارات: السرعة ${TEMPOS.find((t) => t.id === tempo)!.ar}${climb ? '، طالعة لوحدها' : ''}`}>
          <div className="choices" role="group" aria-label="السرعة">
            {TEMPOS.map((t) => (
              <button
                key={t.id}
                className={t.id === tempo ? 'chip active' : 'chip'}
                onClick={() => {
                  setTempo(t.id);
                  setPref('pv.tempo', t.id);
                }}
              >
                {t.ar}
              </button>
            ))}
          </div>
          <label className="check-row">
            <input
              type="checkbox"
              checked={climb}
              onChange={(e) => {
                setClimb(e.target.checked);
                setPref('pv.climb', e.target.checked ? '1' : '0');
                run.current.dir = 'up';
              }}
            />
            ⬆ تطلع لوحدها نص تون بعد كل مرة حلوة (٨٠٪ أو أكتر)، وبعدين تنزل
          </label>
        </Options>
      </div>

      <PianoKeyboard target={shown?.key ?? null} quarter={shown?.quarter ?? 0} hit={sung?.onKeyboard ? sung.midi : null} comfort={range} labels={labels} zoom={zoom} onKey={pick} />

      <div className="pv-now" aria-live="polite">
        {shownStep && (
          <>
            <span className="pv-syllable">{shownStep.syllable}</span>
            <span dir="auto">{nameOf(shownStep.midi)}</span>
          </>
        )}
      </div>

      <ol className="pv-dots" aria-label="نغمات التمرين">
        {steps.map((s, i) => {
          const r = follow.results[i];
          const cls = r ? (r.ok ? 'ok' : 'bad') : (phase === 'sing' && i === follow.index) || (phase === 'listen' && i === playIndex) ? 'now' : '';
          return (
            <li key={i} className={cls}>
              <span className="pv-dot">{r ? (r.ok ? '✔' : '✘') : s.syllable}</span>
              {r && !r.ok && <small>{offWords(r.cents)}</small>}
            </li>
          );
        })}
      </ol>

      <ErrorText text={error} />

      {phase === 'sing' && (
        <div className="panel center">
          <p className="guide">
            دلوقتي: <b>{shownStep?.syllable}</b> على <span dir="auto">{shownStep ? nameOf(shownStep.midi) : ''}</span>
          </p>
          <CentsMeter cents={liveCents} tolerance={STEP_TOLERANCE} />
          <OctaveHint rawCents={raw.current} fromTest={range.fromTest} />
        </div>
      )}
      {phase === 'ref' && <p className="panel center hint">اسمعي أول نغمة… وبعدين دورك.</p>}

      {score && phase !== 'sing' && (
        <div className="panel">
          <div className="stats">
            <Stat label="مظبوطين" value={`${score.ok} من ${score.total}`} />
            <Stat label="النتيجة" value={`${score.percent}%`} />
          </div>
          {score.off.length > 0 && (
            <p className="hint">
              محتاجين شغل:{' '}
              {score.off.map((o) => (
                <span key={o.index} className="pv-off" dir="auto">
                  {nameOf(steps[o.index].midi)} ({offWords(o.cents)})
                </span>
              ))}
            </p>
          )}
          {note && <p className="ok-text">{note}</p>}
          <div className="row">
            <button onClick={() => move(-1)} disabled={busy}>
              ⬇ نص تون
            </button>
            <button onClick={() => void sing()} disabled={busy}>
              🔁 تاني نفس الطبقة
            </button>
            <button onClick={() => move(1)} disabled={busy}>
              ⬆ نص تون
            </button>
          </div>
        </div>
      )}

      <div className="row">
        {busy ? (
          <button className="big primary" onClick={stopAll}>
            ⏹ وقفي
          </button>
        ) : (
          <>
            <button onClick={() => void listen()}>🔊 اسمعي</button>
            <button className="big primary" onClick={() => void sing()}>
              🎤 دورك
            </button>
          </>
        )}
      </div>
    </>
  );
}
