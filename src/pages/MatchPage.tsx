import { useRef, useState } from 'react';
import { YouTubeSearch } from '../components/Demo';
import { CentsMeter, ErrorText, LiveNote, Page, Stat } from '../components/ui';
import { SoundPicker } from '../components/SoundPicker';
import { OctaveHint } from '../components/OctaveHint';
import { HoldRing } from '../components/HoldRing';
import { ActivityBadge } from '../components/ActivityBadge';
import { useMic } from '../audio/useMic';
import { playNote } from '../audio/sound';
import { centsBetween, midiToFreq, noteName, noteNameAr } from '../lib/music';
import { guidance, HoldTracker, mean, median, percent } from '../lib/stats';
import { addResult } from '../lib/storage';
import { exerciseRange, NO_RANGE_HINT } from './common';

const TOLERANCE = 20;

function randomNote(low: number, high: number, avoid?: number): number {
  for (let i = 0; i < 10; i++) {
    const m = low + Math.floor(Math.random() * (high - low + 1));
    if (m !== avoid) return m;
  }
  return low;
}

export interface MatchStats {
  hits: number;
  tries: number;
  /** average over attempts of the median |cents| off while trying */
  avgCents: number | null;
  /** average seconds from hearing the note to locking onto it (successful attempts) */
  avgLockSec: number | null;
}

export function MatchPage({ range: fixedRange, onResult }: { range?: { low: number; high: number }; onResult?: (s: MatchStats) => void } = {}) {
  const range = useRef(fixedRange ? { ...fixedRange, fromTest: true } : exerciseRange()).current;
  const [target, setTarget] = useState<number | null>(null);
  const [hits, setHits] = useState(0);
  const [tries, setTries] = useState(0);
  const [progress, setProgress] = useState(0);
  const [success, setSuccess] = useState(false);
  const [saved, setSaved] = useState(false);
  const hold = useRef(new HoldTracker(TOLERANCE, 1000));
  const last = useRef(0);
  const state = useRef({ target, success, playing: false });
  // for the beginner path: how far off she is while trying, and how long until she locks on
  const attemptCents = useRef<number[]>([]);
  const rawRecent = useRef<number[]>([]); // raw cents (not wrapped) for the octave hint
  const listenStart = useRef(0);
  const stats = useRef({ hits: 0, tries: 0, cents: [] as number[], locks: [] as number[] });
  const endAttempt = (hit: boolean, t: number) => {
    const s = stats.current;
    s.tries++;
    if (hit) {
      s.hits++;
      s.locks.push(Math.max(0, (t - listenStart.current - 1000) / 1000)); // minus the 1 s hold itself
    }
    if (attemptCents.current.length) s.cents.push(median(attemptCents.current));
    attemptCents.current = [];
    onResult?.({ hits: s.hits, tries: s.tries, avgCents: s.cents.length ? mean(s.cents) : null, avgLockSec: s.locks.length ? mean(s.locks) : null });
  };
  state.current.target = target;
  state.current.success = success;

  const { frame, on, error, start, stop } = useMic((f) => {
    const s = state.current;
    const dt = last.current ? f.t - last.current : 0;
    last.current = f.t;
    if (s.target === null || s.success || s.playing) return;
    const cents = f.freq ? centsBetween(f.freq, midiToFreq(s.target)) : null;
    if (cents !== null) {
      attemptCents.current.push(Math.abs(cents));
      rawRecent.current = [...rawRecent.current.slice(-39), cents];
    }
    setProgress(hold.current.update(cents, dt));
    if (hold.current.done) {
      s.success = true; // block repeats until React re-renders
      endAttempt(true, f.t);
      setSuccess(true);
      setHits((h) => h + 1);
      setTries((t) => t + 1);
    }
  });

  const play = async (midi: number) => {
    state.current.playing = true;
    await playNote(midiToFreq(midi), 1.3);
    state.current.playing = false;
    hold.current.reset();
    listenStart.current = performance.now();
  };

  const next = async (countMiss: boolean) => {
    if (countMiss) {
      setTries((t) => t + 1);
      endAttempt(false, performance.now());
    }
    attemptCents.current = [];
    rawRecent.current = [];
    const m = randomNote(range.low, range.high, target ?? undefined);
    setTarget(m);
    setSuccess(false);
    setProgress(0);
    setSaved(false);
    await start();
    await play(m);
  };

  /** "جلسة جديدة": a fresh session (score back to zero), then the first note */
  const newSession = async () => {
    setHits(0);
    setTries(0);
    stats.current = { hits: 0, tries: 0, cents: [], locks: [] };
    await next(false);
  };

  const end = () => {
    stop();
    if (tries > 0) {
      addResult('match', percent(hits, tries), `${hits}/${tries}`);
      setSaved(true);
    }
    setTarget(null);
  };

  const cents = target !== null && frame?.freq ? centsBetween(frame.freq, midiToFreq(target)) : null;
  const g = cents !== null ? guidance(cents, TOLERANCE) : null;

  return (
    <Page tips mic help="match" title="مطابقة النغمة" intro={`هتسمعي نغمة، غنيها واثبتي عليها ثانية في حدود ±${TOLERANCE} سنت.`}>
      <YouTubeSearch k="matchPitch" />
      {!range.fromTest && <p className="hint">{NO_RANGE_HINT}</p>}
      <ErrorText text={error} />
      <SoundPicker />

      <div className="stats">
        <Stat label="صح" value={hits} />
        <Stat label="محاولات" value={tries} />
        <Stat label="النتيجة" value={`${percent(hits, tries)}%`} />
      </div>

      {target === null ? (
        <>
          {saved && <p className="ok-text">الجلسة اتحفظت ✔</p>}
          <button className="big" onClick={newSession}>
            {tries ? 'جلسة جديدة' : 'ابدئي'}
          </button>
        </>
      ) : (
        <div className="panel center">
          <p className="hint">النغمة المطلوبة</p>
          <div className="target-note">
            <span dir="ltr">{noteName(target)}</span> <small>{noteNameAr(target)}</small>
          </div>
          <LiveNote freq={frame?.freq ?? null} />
          <CentsMeter cents={cents} tolerance={TOLERANCE} />
          {!success && <OctaveHint rawCents={rawRecent.current} fromTest={range.fromTest} />}
          <p className={'guide' + (g?.ok ? ' ok-text' : '')}>{success ? 'برافو! 🎉' : g ? g.ar : on ? 'غني النغمة…' : ''}</p>
          <HoldRing progress={progress} ok={success} />
          <ActivityBadge done={success} />
          <div className="row">
            <button onClick={() => play(target)}>🔊 اسمعيها تاني</button>
            {success ? (
              <button className="primary" onClick={() => next(false)}>
                النغمة اللي بعدها ←
              </button>
            ) : (
              <button onClick={() => next(true)}>تخطي</button>
            )}
          </div>
          <button className="link" onClick={end}>
            إنهاء الجلسة وحفظ النتيجة
          </button>
        </div>
      )}
    </Page>
  );
}
