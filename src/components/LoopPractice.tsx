// "🔁 كرري الحتة دي": loop a hard phrase N times, with a score for every repeat. Works with an
// audio element (file mode) or the YouTube player, through the small LoopSource interface.

import { useEffect, useRef, useState } from 'react';
import { ErrorText, LiveNote, Options, Stat } from './ui';
import { PitchGraph } from './PitchGraph';
import { Help } from './Help';
import { useMic } from '../audio/useMic';
import { loopWindow, markAt, mediaLatency, nudge, trend, type LoopWindow } from '../lib/loop';
import type { PitchPoint } from '../lib/compare';
import { addResult } from '../lib/storage';

export interface LoopSource {
  duration(): number;
  currentTime(): number;
  play(): void;
  pause(): void;
  seek(t: number): void;
  /** speeds this source supports (1 first) */
  rates(): number[];
  setRate(r: number): void;
  playing(): boolean;
  /** text under the speed buttons */
  rateNote: string;
}

/** An <audio> element as a loop source; slower speeds keep the pitch (preservesPitch / Safari's webkitPreservesPitch). */
export function audioLoopSource(el: HTMLAudioElement, fallbackDuration: number): LoopSource {
  const keepPitch = el as HTMLAudioElement & { webkitPreservesPitch?: boolean; mozPreservesPitch?: boolean };
  keepPitch.preservesPitch = true;
  keepPitch.webkitPreservesPitch = true;
  keepPitch.mozPreservesPitch = true;
  return {
    duration: () => (Number.isFinite(el.duration) && el.duration > 0 ? el.duration : fallbackDuration),
    currentTime: () => el.currentTime,
    play: () => void el.play(),
    pause: () => el.pause(),
    seek: (t) => (el.currentTime = t),
    rates: () => [1, 0.85, 0.75],
    setRate: (r) => {
      el.playbackRate = r;
      el.defaultPlaybackRate = r;
    },
    playing: () => !el.paused,
    rateNote: 'السرعة الأبطأ بتفضل على نفس الطبقة (النغمات مش بتوطى).',
  };
}

const LATENCY = 0.1;
const GAP_MS = 1500;
const REPEAT_CHOICES = [3, 5, 10, 0]; // 0 = until stopped

const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;

interface Props {
  source: LoopSource;
  /** the moment to loop (an off range), padded automatically */
  moment: { start: number; end: number };
  /** score 0..100 for one repeat */
  score: (sung: PitchPoint[], w: LoopWindow) => number;
  reference?: PitchPoint[];
  guides?: { midi: number; tonic: boolean }[];
  label: string;
  /** set when looping a song from the library */
  songId?: string;
  /** seconds added before/after the moment (default 1) */
  pad?: number;
  /** each repeat's score, as it's measured */
  onScore?: (score: number) => void;
  onClose: () => void;
}

export function LoopPractice({ source, moment, score, reference, guides, label, songId, pad, onScore, onClose }: Props) {
  const [w, setW] = useState(() => loopWindow(moment.start, moment.end, source.duration(), pad));
  const onScoreRef = useRef(onScore);
  onScoreRef.current = onScore;
  const [repeats, setRepeats] = useState(5);
  const [rate, setRateState] = useState(1);
  const [phase, setPhase] = useState<'idle' | 'loop' | 'gap' | 'free'>('idle');
  const [scores, setScores] = useState<number[]>([]);
  const [live, setLive] = useState<PitchPoint[]>([]);
  const [pos, setPos] = useState(0);
  const frames = useRef<PitchPoint[]>([]);
  const st = useRef({ phase: 'idle' as string, w, repeats, rate, scores: [] as number[] });
  st.current.w = w;
  st.current.repeats = repeats;
  st.current.rate = rate;

  const { frame, error, start, stop } = useMic((f) => {
    const s = st.current;
    if (s.phase !== 'loop' || !source.playing()) return;
    const t = source.currentTime() - mediaLatency(LATENCY, s.rate);
    if (t < s.w.start) return;
    frames.current.push({ t, freq: f.freq });
    if (frames.current.length % 6 === 0) setLive([...frames.current]);
  });

  const setP = (p: 'idle' | 'loop' | 'gap' | 'free') => {
    st.current.phase = p;
    setPhase(p);
  };

  const save = () => {
    const sc = st.current.scores;
    if (sc.length) addResult('loop', sc[sc.length - 1], `${label}: ${trend(sc).text}`, { songId });
  };

  const finish = () => {
    source.pause();
    stop();
    save();
    setP('idle');
  };

  const playRepeat = () => {
    frames.current = [];
    setLive([]);
    source.seek(st.current.w.start);
    source.play();
    setP('loop');
  };

  // the loop driver: watch the position; at the loop end, score this repeat, pause, then go again
  useEffect(() => {
    const id = setInterval(() => {
      const s = st.current;
      if (s.phase !== 'loop' && s.phase !== 'free') return;
      const t = source.currentTime();
      setPos(t);
      if (s.phase !== 'loop' || t < s.w.end) return;
      source.pause();
      const value = score(frames.current, s.w);
      s.scores = [...s.scores, value];
      setScores(s.scores);
      onScoreRef.current?.(value);
      if (s.repeats && s.scores.length >= s.repeats) return finish();
      setP('gap');
      setTimeout(() => st.current.phase === 'gap' && playRepeat(), GAP_MS);
    }, 40);
    return () => clearInterval(id);
  }, []); // reads everything through st (refs); source/score are fixed for this panel

  useEffect(
    () => () => {
      source.pause();
      if (st.current.scores.length && st.current.phase !== 'idle') save();
    },
    [],
  );

  const begin = async () => {
    st.current.scores = [];
    setScores([]);
    source.setRate(rate);
    if (await start()) playRepeat();
  };

  const freePlay = () => {
    source.setRate(rate);
    if (phase === 'free') {
      source.pause();
      setP('idle');
    } else {
      source.play();
      setP('free');
    }
  };

  const chooseRate = (r: number) => {
    setRateState(r);
    source.setRate(r);
  };

  const dur = source.duration();
  const t = trend(scores);
  const running = phase === 'loop' || phase === 'gap';
  const refInside = (reference ?? []).filter((p) => p.t >= w.start && p.t <= w.end);

  return (
    <div className="panel loop-panel">
      <div className="tips-head">
        <h2>🔁 كرري الحتة دي</h2>
        <button className="link" onClick={() => (running ? finish() : onClose())}>
          {running ? 'وقفي' : 'قفلي ✕'}
        </button>
      </div>
      <Help id="loop" />
      <ErrorText text={error} />

      <div className="loop-window">
        <div className="row">
          <span>البداية</span>
          <button disabled={running} onClick={() => setW(nudge(w, 'start', -0.5, dur))} aria-label="البداية بدري نص ثانية">
            −
          </button>
          <b dir="ltr">{fmt(w.start)}</b>
          <button disabled={running} onClick={() => setW(nudge(w, 'start', 0.5, dur))} aria-label="البداية متأخر نص ثانية">
            +
          </button>
        </div>
        <div className="row">
          <span>النهاية</span>
          <button disabled={running} onClick={() => setW(nudge(w, 'end', -0.5, dur))} aria-label="النهاية بدري نص ثانية">
            −
          </button>
          <b dir="ltr">{fmt(w.end)}</b>
          <button disabled={running} onClick={() => setW(nudge(w, 'end', 0.5, dur))} aria-label="النهاية متأخر نص ثانية">
            +
          </button>
        </div>
        <div className="row">
          <button disabled={running} onClick={freePlay}>
            {phase === 'free' ? '⏸ وقفي' : '▶️ شغّلي عادي'}
          </button>
          <button disabled={phase !== 'free'} onClick={() => setW(markAt(w, 'start', source.currentTime(), dur))}>
            بداية هنا
          </button>
          <button disabled={phase !== 'free'} onClick={() => setW(markAt(w, 'end', source.currentTime(), dur))}>
            نهاية هنا
          </button>
        </div>
        {phase === 'free' && (
          <p className="hint">
            دلوقتي: <span dir="ltr">{fmt(pos)}</span>
          </p>
        )}
      </div>

      <Options label={`خيارات: ${repeats || '∞'} مرات، سرعة ${Math.round(rate * 100)}%`}>
      <div className="choices">
        <span className="hint">عدد المرات:</span>
        {REPEAT_CHOICES.map((n) => (
          <button key={n} disabled={running} className={n === repeats ? 'chip active' : 'chip'} onClick={() => setRepeats(n)}>
            {n || 'لحد ما أوقف'}
          </button>
        ))}
      </div>
      <div className="choices">
        <span className="hint">السرعة:</span>
        {source.rates().map((r) => (
          <button key={r} disabled={running} className={r === rate ? 'chip active' : 'chip'} onClick={() => chooseRate(r)}>
            {Math.round(r * 100)}%
          </button>
        ))}
      </div>
      <p className="hint">{source.rateNote}</p>
      </Options>

      {running && (
        <>
          <p className="guide">
            {phase === 'gap' ? 'استعدي… ' : 'غني! '}
            المرة {Math.min(scores.length + 1, repeats || Infinity)}
            {repeats ? ` من ${repeats}` : ''}
          </p>
          <LiveNote freq={frame?.freq ?? null} />
          {(refInside.length > 0 || live.length > 1) && <PitchGraph reference={refInside} sung={live} guides={guides} startT={w.start} />}
        </>
      )}
      {!running && (
        <button className="big primary" onClick={begin}>
          🔁 {scores.length ? 'كرري تاني' : 'ابدئي التكرار'}
        </button>
      )}

      {scores.length > 0 && (
        <div className="center">
          <Stat label="كل مرة" value={<span>{t.text}</span>} />
          {t.better === true && <p className="ok-text">بتتحسني مع كل مرة 👏</p>}
          {t.better === false && <p className="hint">عادي — جربي سرعة أبطأ أو ريّحي شوية.</p>}
        </div>
      )}
    </div>
  );
}
