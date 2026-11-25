// Runs one course exercise with the app's existing engine for it, set up as the course says (notes from her
// comfortable range), and reports each go as a number for the goal (plus whether it was a real go).

import { useEffect, useRef, useState } from 'react';
import type { CourseExercise } from '../content/course';
import { EmbeddedContext } from './ui';
import { PianoKeyboard } from './PianoKeyboard';
import { PianoVocalise } from './PianoVocalise';
import { Hiss, Stability, Sustain } from '../pages/BreathPage';
import { MatchPage } from '../pages/MatchPage';
import { FindNotePage } from '../pages/FindNotePage';
import { Siren, Trill } from '../pages/WarmupPage';
import { DynamicsPage } from '../pages/DynamicsPage';
import { IntervalPage } from '../pages/IntervalPage';
import { exerciseRange } from '../pages/common';
import { playNote } from '../audio/sound';
import { midiToFreq } from '../lib/music';
import { middleRange } from '../lib/path';
import { inUserOctave } from '../lib/voice';
import { ladderNotes } from '../lib/ladder';
import { MAQAMAT } from '../lib/maqam';
import { patternSteps, patternTop, type PatternSource } from '../lib/pianoVocalise';
import { getPref, getResults, getSongs, today } from '../lib/storage';
import { percent } from '../lib/stats';
import { intervalsIsReal, matchIsReal, secondsIsReal, sirenIsReal, stabilityIsReal, trillIsReal } from '../lib/stepRules';
import { songPhrasesOnDay, ar, type CourseMeasure } from '../lib/course';
import type { LabelStyle } from '../lib/keyboard';

type Range = { low: number; high: number; fromTest: boolean };

const center = (r: { low: number; high: number }) => Math.round((r.low + r.high) / 2);

/** The pattern (or maqam scale) a piano-vocalise exercise sings. */
export function courseSource(ex: CourseExercise): PatternSource | null {
  if (ex.engine.kind === 'pattern') return { kind: 'vocalise', id: ex.engine.pattern };
  if (ex.engine.kind === 'maqamScale') {
    const id = ex.engine.maqam;
    return { kind: 'maqam', maqam: MAQAMAT.find((m) => m.id === id)! };
  }
  return null;
}

/**
 * Where a piano-vocalise exercise moves: her comfortable range; 'top' starts a little under her highest comfortable
 * start and may climb 2 semitones past it; 'bottom' starts at her lowest comfortable start and may go 2 below it.
 */
export function patternZone(ex: CourseExercise, range: Range): { range: Range; startAt: number } {
  const src = courseSource(ex)!;
  const top = patternTop(patternSteps(src, 0), 0);
  const zone = ex.engine.kind === 'pattern' ? ex.engine.zone : undefined;
  if (zone === 'top') {
    const startAt = Math.max(range.low, Math.round(range.high - top - 1));
    return { range: { ...range, low: startAt, high: range.high + 2 }, startAt };
  }
  if (zone === 'bottom') return { range: { ...range, low: range.low - 2, high: Math.round(range.low + top + 1) }, startAt: range.low };
  return { range, startAt: range.low };
}

/** Notes for "🔊 اسمعي المثال" on exercises without their own example (null = none, or the exercise has one). */
export function demoNotes(ex: CourseExercise, range: Range): number[] | null {
  const mid = middleRange(range.low, range.high);
  switch (ex.engine.kind) {
    case 'sustain':
    case 'stability':
      return [center(mid)];
    case 'match':
      return ex.engine.span === 'one' ? [center(mid)] : [mid.low, center(mid), mid.high];
    case 'ladder':
      return ladderNotes(inUserOctave(60, range.low, range.high - 7 >= range.low ? range.high - 7 : range.high));
    case 'intervals':
      return ex.engine.level === 0 ? [mid.low, mid.low + 7, mid.low + 12] : [mid.low, mid.low + 4, mid.low + 5];
    case 'dynamics':
      return [center(range) - 2];
    default:
      return null;
  }
}

/** "🔊 اسمعي المثال" with the notes lighting up on the piano. */
export function CourseDemo({ notes, range }: { notes: number[]; range: Range }) {
  const [now, setNow] = useState<number | null>(null);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );
  const play = async () => {
    for (const n of notes) {
      if (!alive.current) return;
      setNow(n);
      await playNote(midiToFreq(n), notes.length === 1 ? 1.5 : 0.7);
    }
    if (alive.current) setNow(null);
  };
  return (
    <div className="course-demo">
      <PianoKeyboard target={now ?? notes[0]} quarter={0} hit={null} comfort={range} labels={(getPref('piano.labels') as LabelStyle) || 'solfege'} zoom={false} onKey={() => {}} inline />
      <button onClick={() => void play()} disabled={now !== null}>
        🔊 اسمعي المثال
      </button>
    </div>
  );
}

/** A song from her library, phrase by phrase (the library's "learn" page), counted from today's phrase-loop results. */
function SongStep({ onMeasure }: { onMeasure: (m: CourseMeasure, real: boolean) => void }) {
  const songs = getSongs().filter((s) => s.file);
  const results = getResults();
  const day = today();
  const counts = songs.map((s) => ({ s, n: songPhrasesOnDay(results, s.id, day) }));
  const best = Math.max(0, ...counts.map((c) => c.n));
  useEffect(() => {
    if (best > 0) onMeasure({ value: best }, true);
  }, [best]);
  if (!songs.length)
    return (
      <div className="panel center">
        <p>مفيش أغنية فيها ملف صوت لسه.</p>
        <a className="button-link" href="#/songs/new">
          ➕ ضيفي أغنية
        </a>
      </div>
    );
  return (
    <div className="panel">
      <p className="hint">اختاري الأغنية — هتفتح جملة جملة، وارجعي هنا بعدها.</p>
      <div className="ex-list">
        {counts.map(({ s, n }) => (
          <a key={s.id} className="list-row" href={`#/songs/${s.id}/learn`}>
            <span>
              <span className="row-main">{s.title}</span>
              <span className="row-label">النهارده: {ar(n)} جمل وصلت للهدف</span>
            </span>
            <span className="chev" aria-hidden>
              ‹
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}

/** The exercise itself. `onMeasure` gets every go: the goal's number, and whether it was a real go. */
export function CourseRunner({ ex, onMeasure }: { ex: CourseExercise; onMeasure: (m: CourseMeasure, real: boolean) => void }) {
  const range = useRef(exerciseRange()).current;
  const mid = middleRange(range.low, range.high);
  const e = ex.engine;
  let body: React.ReactNode = null;
  switch (e.kind) {
    case 'hiss':
      body = <Hiss onResult={(v) => onMeasure({ value: v }, secondsIsReal(v))} />;
      break;
    case 'sustain':
      body = <Sustain note={center(mid)} onResult={(v) => onMeasure({ value: v }, secondsIsReal(v))} />;
      break;
    case 'stability':
      body = <Stability onResult={(v) => onMeasure({ value: v }, stabilityIsReal(v))} />;
      break;
    case 'match': {
      const r = e.span === 'one' ? { low: center(mid), high: center(mid) } : e.span === 'mid' ? mid : range;
      body = <MatchPage range={r} onResult={(s) => onMeasure({ value: percent(s.hits, s.tries), tries: s.tries }, matchIsReal(s.tries, s.avgCents, 3))} />;
      break;
    }
    case 'ladder':
      body = <FindNotePage onResult={(n) => onMeasure({ value: n }, n >= 3)} />;
      break;
    case 'trill':
      body = <Trill seconds={45} onResult={(s) => onMeasure({ value: s }, trillIsReal(s))} />;
      break;
    case 'siren': {
      const wide = e.wide ? { low: range.low - 1, high: range.high + 1 } : { low: range.low + 1, high: range.high - 1 };
      body = <Siren seconds={40} mid={mid} wide={wide} onResult={(r) => onMeasure({ value: r.avgCents ?? 9999 }, sirenIsReal(r.voicedShare, r.seconds) && r.avgCents !== null)} />;
      break;
    }
    case 'pattern':
    case 'maqamScale': {
      const z = patternZone(ex, range);
      body = (
        <PianoVocalise
          key={ex.id}
          labels={(getPref('piano.labels') as LabelStyle) || 'solfege'}
          zoom={false}
          range={z.range}
          startAt={z.startAt}
          preset={{ src: courseSource(ex)!, tempo: e.tempo }}
          onRound={(sc) => onMeasure({ value: sc.ok }, sc.ok > 0 || sc.off.some((o) => o.cents !== null))}
        />
      );
      break;
    }
    case 'dynamics':
      body = <DynamicsPage shape={e.shape} onResult={(t) => onMeasure({ value: t }, t > 0)} />;
      break;
    case 'intervals':
      body = <IntervalPage level={e.level} onResult={(r, t) => onMeasure({ value: percent(r, t), tries: t }, intervalsIsReal(r, t))} />;
      break;
    case 'song':
      body = <SongStep onMeasure={onMeasure} />;
      break;
  }
  const demo = demoNotes(ex, range);
  return (
    <>
      {demo && <CourseDemo notes={demo} range={range} />}
      <EmbeddedContext.Provider value={true}>{body}</EmbeddedContext.Provider>
    </>
  );
}
