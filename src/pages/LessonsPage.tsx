import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CentsMeter, Page } from '../components/ui';
import { HoldRing } from '../components/HoldRing';
import { PianoKeyboard } from '../components/PianoKeyboard';
import { SoundPicker } from '../components/SoundPicker';
import { playNote } from '../audio/sound';
import { audioContext } from '../audio/audio';
import { playSuccess } from '../audio/chime';
import { click } from '../audio/metronome';
import { useMic } from '../audio/useMic';
import { GLOSSARY_TERMS, LESSONS, lessonById, quizPassed, scoreQuiz, soundFreqs, soundOffsets, termByKey, type Block, type Lesson, type LessonSection, type Sound } from '../content/lessons';
import { centsToTarget, nearestKey, PIANO_HOLD_MS, PIANO_TOLERANCE, targetFreq, type Quarter } from '../lib/keyboard';
import { drawQuiz, isRead, markRead, readCount, resumeSection, setLast, type LessonProgress, type Reading } from '../lib/lessonProgress';
import { HoldTracker } from '../lib/stats';
import { AJNAS, buildScale, INTERVALS, maqamChart, NOTE_VALUES, stepName, tonicOffset, triad } from '../lib/theory';
import { getLessonProgress, getLessonsDone, markLessonDone, saveLessonProgress } from '../lib/storage';
import { inUserOctave } from '../lib/voice';
import { exerciseRange } from './common';

/** C in the user's own octave, so examples sound in their voice range. */
function baseC(): number {
  const r = exerciseRange();
  return inUserOctave(60, r.low, r.high - 12 >= r.low ? r.high - 12 : r.high);
}

/** The key an offset is shown on: a quarter tone sits on the key above it, marked ½♭ (as on the piano page). */
function keyOf(offset: number): { key: number; quarter: Quarter } {
  const up = Math.ceil(offset);
  return up - offset === 0.5 ? { key: up, quarter: -0.5 } : { key: Math.round(offset), quarter: 0 };
}

async function playClicks(s: Sound) {
  const { bpm, beats, perBar = 4 } = s.clicks!;
  const t0 = audioContext().currentTime + 0.15;
  for (const b of beats) click(t0 + (b * 60) / bpm, Math.abs(b % perBar) < 1e-6);
  await new Promise((r) => setTimeout(r, ((Math.max(...beats) + 1) * 60 * 1000) / bpm + 150));
}

/** Plays a sound; `onNote` says which offset is sounding (null at the end). */
async function playSound(s: Sound, onNote?: (offset: number | null) => void, alive: () => boolean = () => true) {
  if (s.clicks) return playClicks(s);
  const freqs = soundFreqs(s, baseC());
  const offsets = soundOffsets(s);
  if (s.together) {
    await Promise.all(freqs.map((f) => playNote(f, s.dur ?? 1.6)));
    return;
  }
  for (let i = 0; i < freqs.length && alive(); i++) {
    onNote?.(offsets[i]);
    await playNote(freqs[i], s.dur ?? 0.7);
  }
  onNote?.(null);
}

// ---- text

const TermContext = createContext<(key: string) => void>((key) => {
  window.location.hash = `#/lessons/glossary/${key}`;
});

/** Latin runs (E½♭, F♯m, 4/4, C4) keep their own direction inside the Arabic line. */
function Latin({ text }: { text: string }) {
  const parts = text.split(/(\d+\/\d+|[A-Za-z0-9½♯♭#–+-]*[A-Za-z♯♭][A-Za-z0-9½♯♭#–+-]*)/g);
  return (
    <span>
      {parts.map((t, i) => (i % 2 ? <bdi key={i} dir="ltr">{t}</bdi> : t))}
    </span>
  );
}

/** Text with [[term]] / [[term|words]] links to the glossary. */
function Rich({ text }: { text: string }) {
  const openTerm = useContext(TermContext);
  const parts = text.split(/(\[\[[a-z0-9]+(?:\|[^\]]+)?\]\])/g);
  return (
    <>
      {parts.map((part, i) => {
        const m = part.match(/^\[\[([a-z0-9]+)(?:\|([^\]]+))?\]\]$/);
        if (!m) return <Latin key={i} text={part} />;
        return (
          <button key={i} className="term-link" onClick={() => openTerm(m[1])}>
            <Latin text={m[2] ?? termByKey(m[1])?.ar ?? m[1]} />
          </button>
        );
      })}
    </>
  );
}

function Table({ rows }: { rows: string[][] }) {
  return (
    <div className="lesson-table">
      <table>
        <thead>
          <tr>
            {rows[0].map((c, i) => (
              <th key={i}>
                <Rich text={c} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(1).map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j}>
                  <Rich text={c} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---- "جربي بصوتك"

function VoiceTry({ label, notes, base, active, onActivate, onTarget, onHit }: { label: string; notes: number[]; base: number; active: boolean; onActivate: () => void; onTarget: (offset: number | null) => void; onHit: (midi: number | null) => void }) {
  const [idx, setIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [allDone, setAllDone] = useState(false);
  const hold = useRef(new HoldTracker(PIANO_TOLERANCE, PIANO_HOLD_MS));
  const st = useRef({ idx: 0, last: 0, playing: false, finished: false });
  const target = keyOf(notes[Math.min(idx, notes.length - 1)]);

  const playTarget = async (i: number) => {
    const k = keyOf(notes[i]);
    onTarget(notes[i]);
    st.current.playing = true;
    await playNote(targetFreq(base + k.key, k.quarter), 1);
    st.current.playing = false;
    hold.current.reset();
  };

  const { frame, on, error, start, stop } = useMic((f) => {
    const s = st.current;
    const dt = s.last ? f.t - s.last : 0;
    s.last = f.t;
    if (s.playing || s.finished) return;
    const k = keyOf(notes[s.idx]);
    const c = f.freq ? centsToTarget(f.freq, base + k.key, k.quarter) : null;
    setProgress(hold.current.update(c, dt));
    if (hold.current.done) {
      playSuccess();
      hold.current.reset();
      setProgress(0);
      if (s.idx + 1 < notes.length) {
        s.idx++;
        setIdx(s.idx);
        void playTarget(s.idx);
      } else {
        s.finished = true;
        setAllDone(true);
      }
    }
  });

  // only one mic at a time on a screen
  useEffect(() => {
    if (!active && on) stop();
  }, [active, on]);
  useEffect(() => {
    onHit(on && frame?.freq ? (nearestKey(frame.freq)?.midi ?? null) : null);
  }, [frame, on]);

  const begin = async () => {
    onActivate();
    st.current = { idx: 0, last: 0, playing: false, finished: false };
    setIdx(0);
    setAllDone(false);
    setProgress(0);
    const m = await start();
    if (m) void playTarget(0);
  };
  const cents = on && frame?.freq ? centsToTarget(frame.freq, base + target.key, target.quarter) : null;

  return (
    <div className="lesson-voice">
      <p>
        <b>🎤 جربي بصوتك:</b> <Latin text={label} />
      </p>
      {on ? (
        <>
          {notes.length > 1 && (
            <p className="hint">
              نغمة {idx + 1} من {notes.length}
            </p>
          )}
          <CentsMeter cents={cents} tolerance={PIANO_TOLERANCE} />
          <div className="piano-hold">
            <HoldRing progress={allDone ? 1 : progress} ok={allDone} />
            <p className={allDone ? 'guide ok-text' : 'guide'}>{allDone ? '✔ برافو! طلعت مظبوطة.' : cents === null ? 'غني النغمة…' : Math.abs(cents) <= PIANO_TOLERANCE ? 'اثبتي كده' : cents > 0 ? 'انزلي شوية ⬇' : 'اطلعي شوية ⬆'}</p>
          </div>
          <div className="row">
            <button onClick={() => void playTarget(st.current.idx)}>🔊 اسمعي النغمة</button>
            <button
              onClick={() => {
                stop();
                onTarget(null);
              }}
            >
              ⏹ وقفي
            </button>
          </div>
        </>
      ) : (
        <button className="primary" onClick={() => void begin()}>
          🎤 ابدئي
        </button>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

// ---- a section: its blocks and the keyboard they light up

const sectionHasNotes = (sc: LessonSection) => sc.blocks.some((b) => 'keys' in b || 'scale' in b || 'maqam' in b || 'chord' in b || 'voice' in b || 'intervals' in b || 'ajnas' in b || ('listen' in b && b.listen.some((e) => !e.sound.clicks)));

const scaleOffsets = (kind: Parameters<typeof buildScale>[0], tonic: string) => buildScale(kind, tonic).notes.map((n) => tonicOffset(tonic) + n.cents / 100);

function firstLit(sc: LessonSection): number[] {
  for (const b of sc.blocks) {
    if ('keys' in b) return b.keys;
    if ('scale' in b) return scaleOffsets(b.scale.kind, b.scale.tonic);
    if ('maqam' in b) return maqamChart(b.maqam).offsets;
  }
  return [];
}

function SectionBody({ section }: { section: LessonSection }) {
  const base = useMemo(baseC, []);
  const comfort = useMemo(exerciseRange, []);
  const [lit, setLit] = useState<number[]>(() => firstLit(section));
  const [now, setNow] = useState<number | null>(null);
  const [hit, setHit] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [voice, setVoice] = useState<number | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const play = async (s: Sound) => {
    setBusy(true);
    if (!s.clicks) setLit(soundOffsets(s));
    await playSound(s, setNow, () => alive.current);
    setBusy(false);
  };
  const cur = now === null ? null : keyOf(now);
  const litKeys = useMemo(() => lit.map((o) => base + keyOf(o).key), [lit, base]);
  const halfFlats = useMemo(() => lit.filter((o) => keyOf(o).quarter !== 0).map((o) => base + keyOf(o).key), [lit, base]);

  const listen = (label: ReactNode, s: Sound, key: string | number) => (
    <button key={key} disabled={busy} onClick={() => void play(s)}>
      <span>🔊 اسمعي: {label}</span>
    </button>
  );

  const render = (b: Block, i: number) => {
    if ('p' in b)
      return (
        <p key={i}>
          <Rich text={b.p} />
        </p>
      );
    if ('ex' in b)
      return (
        <p key={i} className="lesson-box lesson-ex">
          <b>مثال: </b>
          <Rich text={b.ex} />
        </p>
      );
    if ('like' in b)
      return (
        <p key={i} className="lesson-box lesson-like">
          <b>تشبيه: </b>
          <Rich text={b.like} />
        </p>
      );
    if ('note' in b)
      return (
        <p key={i} className="lesson-box lesson-note">
          <b>خدي بالك: </b>
          <Rich text={b.note} />
        </p>
      );
    if ('listen' in b) return <div key={i} className="examples">{b.listen.map((e, j) => listen(<Latin text={e.label} />, e.sound, j))}</div>;
    if ('keys' in b)
      return (
        <div key={i} className="examples">
          <button disabled={busy} onClick={() => void play({ notes: b.keys, dur: 0.7 })}>
            <span>
              🎹 <Latin text={b.caption ?? 'ورّيني على البيانو'} />
            </span>
          </button>
        </div>
      );
    if ('table' in b) return <Table key={i} rows={b.table} />;
    if ('scale' in b) {
      const s = buildScale(b.scale.kind, b.scale.tonic);
      return (
        <div key={i}>
          <Table rows={[['النغمة', 'اسمها', 'الخطوة بعدها'], ...s.notes.map((n, j) => [n.name, n.ar, j < s.steps.length ? stepName(s.steps[j]) : 'القرار تاني'])]} />
          <div className="examples">{listen('السلم', { notes: scaleOffsets(b.scale.kind, b.scale.tonic), dur: 0.5 }, 'scale')}</div>
        </div>
      );
    }
    if ('maqam' in b) {
      const c = maqamChart(b.maqam);
      return (
        <div key={i}>
          <Table rows={[['النغمة', 'اسمها', 'سنت من القرار', 'الخطوة بعدها'], ...c.up.map((n, j) => [n.name, n.ar, String(n.cents), j < c.steps.length ? stepName(c.steps[j]) : '—'])]} />
          <p className="lesson-box">
            <b>القرار: </b>
            <Latin text={`${c.up[0].ar} ${c.tonic}`} />
            <br />
            <b>الغماز: </b>
            <Latin text={`${c.ghammaz.ar} ${c.ghammaz.name}`} />
            <br />
            <b>أول جنس: </b>
            {c.jins.ar}
            {c.down && (
              <>
                <br />
                <b>وهو نازل: </b>
                <Latin text={c.down.map((n) => n.name).join(' ')} />
              </>
            )}
          </p>
          <div className="examples">{listen(`${c.ar} طالع`, { notes: c.offsets, dur: 0.5 }, 'up')}</div>
        </div>
      );
    }
    if ('intervals' in b)
      return (
        <div key={i} className="examples">
          {INTERVALS.map((x) =>
            listen(
              <>
                {x.ar} ({x.semis}) <bdi dir="ltr">{x.en}</bdi>
              </>,
              { notes: x.semis ? [0, x.semis] : [0, 0], dur: 0.8 },
              x.semis,
            ),
          )}
        </div>
      );
    if ('ajnas' in b)
      return (
        <div key={i} className="examples">
          {AJNAS.map((j) =>
            listen(
              <>
                {j.ar} <bdi dir="ltr">{j.cents.join(' · ')}</bdi>
              </>,
              { notes: j.cents.map((c) => c / 100), dur: 0.55 },
              j.id,
            ),
          )}
        </div>
      );
    if ('chord' in b)
      return (
        <div key={i} className="examples">
          {b.chord.map((c) => {
            const t = triad(c);
            return listen(
              <>
                <bdi dir="ltr">{c}</bdi> = {t.minor ? 'مينور' : 'ماجير'}: <bdi dir="ltr">{t.notes.join(' ')}</bdi>
              </>,
              { notes: t.semis.map((x) => tonicOffset(t.root) + x), dur: 1.6, together: true },
              c,
            );
          })}
        </div>
      );
    if ('noteValues' in b) return <Table key={i} rows={[['اسمها', 'بالإنجليزي', 'كام ضربة في 4/4'], ...NOTE_VALUES.map((v) => [v.ar, v.en, String(v.beats)])]} />;
    if ('voice' in b)
      return (
        <VoiceTry
          key={i}
          label={b.voice.label}
          notes={b.voice.notes}
          base={base}
          active={voice === i}
          onActivate={() => setVoice(i)}
          onTarget={(o) => {
            setNow(o);
            if (o !== null) setLit(b.voice.notes);
          }}
          onHit={setHit}
        />
      );
    if ('meter' in b)
      return (
        <div key={i} className="center">
          {b.meter.map((c) => (
            <div key={c} className="meter-demo">
              <CentsMeter cents={c} tolerance={20} />
              <span className="hint" dir="ltr">
                {c > 0 ? '+' : ''}
                {c} cents
              </span>
            </div>
          ))}
        </div>
      );
    return (
      <div key={i} className="row lesson-links">
        {b.links.map((l) => (
          <a key={l.href} className="button-link" href={l.href}>
            {l.label}
          </a>
        ))}
      </div>
    );
  };

  return (
    <>
      {sectionHasNotes(section) && (
        <PianoKeyboard
          inline
          highlight={litKeys}
          halfFlats={halfFlats}
          target={cur ? base + cur.key : null}
          quarter={cur?.quarter ?? 0}
          hit={hit}
          comfort={comfort}
          labels="both"
          zoom={false}
          onKey={(midi) => {
            setLit([midi - base]);
            void playNote(targetFreq(midi, 0), 0.8);
          }}
        />
      )}
      {section.blocks.map(render)}
    </>
  );
}

// ---- pages

function Glossary({ focus }: { focus?: string }) {
  const [q, setQ] = useState('');
  useEffect(() => {
    if (focus) document.getElementById(`term-${focus}`)?.scrollIntoView({ block: 'center' });
  }, [focus]);
  const list = GLOSSARY_TERMS.filter((t) => !q.trim() || `${t.ar} ${t.en} ${t.def}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <Page tips title="📖 قاموس المصطلحات" intro="كل كلمة موسيقية في الدروس، بالعربي والإنجليزي.">
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="دوري على كلمة" aria-label="دوري على كلمة" />
      <dl className="glossary">
        {list.map((t) => (
          <div key={t.key} id={`term-${t.key}`} className={t.key === focus ? 'panel glossary-on' : 'panel'}>
            <dt>
              <b>{t.ar}</b> · <bdi dir="ltr">{t.en}</bdi>
            </dt>
            <dd>
              <Latin text={t.def} />
            </dd>
          </div>
        ))}
      </dl>
      {!list.length && <p className="hint">مفيش كلمة زي دي.</p>}
    </Page>
  );
}

function SummaryBox({ lesson }: { lesson: Lesson }) {
  return (
    <div className="lesson-summary">
      <h3>الخلاصة</h3>
      <ul>
        {lesson.summary.map((s) => (
          <li key={s}>
            <Latin text={s} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** #/lessons, #/lessons/glossary[/<term>], #/lessons/summaries, #/lessons/<id>[/resume] */
export function LessonsPage() {
  const [, id, sub] = window.location.hash.replace(/^#\/?/, '').split('/');
  const lesson = id ? lessonById(id) : undefined;
  const [done, setDone] = useState(getLessonsDone);
  if (id === 'glossary') return <Glossary focus={sub} />;
  if (id === 'summaries')
    return (
      <Page tips title="📝 كل الملخصات" intro="خلاصة كل درس في مكان واحد، للمراجعة السريعة.">
        {LESSONS.map((l) => (
          <div key={l.id} className="panel lesson">
            <h2>
              <a href={`#/lessons/${l.id}`}>
                {l.icon} {l.title}
              </a>
            </h2>
            <SummaryBox lesson={l} />
          </div>
        ))}
      </Page>
    );
  if (lesson)
    return (
      <Page tips title={`${lesson.icon} ${lesson.title}`}>
        <LessonView lesson={lesson} resume={sub === 'resume'} onPassed={() => setDone(getLessonsDone())} />
      </Page>
    );
  const count = LESSONS.filter((l) => done[l.id]).length;
  const progress = getLessonProgress();
  const going = LESSONS.find((l) => !done[l.id] && readCount(progress, l.id) > 0);
  return (
    <Page tips help="lessons" title="🎓 أساسيات الموسيقى" intro="دروس تذاكري منها: كل درس أجزاء قصيرة بأمثلة تسمعيها، وخلاصة، واختبار.">
      <p className="hint">
        خلصتي {count} من {LESSONS.length}.
      </p>
      {going && (
        <a className="button-link big primary" href={`#/lessons/${going.id}/resume`}>
          ارجعي لآخر مكان: {going.title}
        </a>
      )}
      <div className="row lesson-links">
        <a className="button-link" href="#/lessons/glossary">
          📖 قاموس المصطلحات
        </a>
        <a className="button-link" href="#/lessons/summaries">
          📝 كل الملخصات
        </a>
      </div>
      <ol className="lesson-list">
        {LESSONS.map((l) => (
          <li key={l.id}>
            <a href={`#/lessons/${l.id}`} className="song-row">
              <span className="song-title">
                {l.icon} <Latin text={l.title} />
              </span>
              <span className="song-score" dir="ltr">
                {done[l.id] ? '✔' : readCount(progress, l.id) ? `${readCount(progress, l.id)}/${l.sections.length}` : ''}
              </span>
            </a>
          </li>
        ))}
      </ol>
    </Page>
  );
}

const CONTENTS = -1;
const CHUNK_DONE = -2;

/**
 * One lesson: contents, sections, summary, then the quiz. Embedded in the beginner path too, where `chunk` limits it to
 * today's part (about 3 minutes of reading, or the quiz once everything's been read).
 */
export function LessonView({ lesson, onPassed, chunk, onChunkDone, resume }: { lesson: Lesson; onPassed?: () => void; chunk?: Reading; onChunkDone?: () => void; resume?: boolean }) {
  const total = lesson.sections.length;
  const QUIZ = total + 1;
  const [progress, setProgress] = useState(getLessonProgress);
  const [screen, setScreen] = useState(() => (chunk ? (chunk.quiz ? QUIZ : chunk.from) : resume ? (resumeSection(getLessonProgress(), lesson) ?? CONTENTS) : CONTENTS));
  const [seed, setSeed] = useState(() => Date.now() % 100000);
  const quiz = useMemo(() => drawQuiz(lesson.pool, seed), [lesson, seed]);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [qi, setQi] = useState(0);
  const [finished, setFinished] = useState(false);
  const [busy, setBusy] = useState(false);
  const [term, setTerm] = useState<string | null>(null);
  const top = useRef<HTMLDivElement | null>(null);
  const needed = Math.ceil(quiz.length * 0.8);

  const update = (p: LessonProgress) => {
    setProgress(p);
    saveLessonProgress(p);
  };
  const go = (next: number, p = progress) => {
    if (next >= 0 && next < total) update(setLast(p, lesson.id, next));
    else if (p !== progress) update(p);
    setScreen(next);
    top.current?.scrollIntoView({ block: 'start' });
  };
  const restart = () => {
    setSeed((x) => x + 1); // a retake differs
    setAnswers([]);
    setQi(0);
    setFinished(false);
  };
  const listenQuestion = async (s: Sound) => {
    setBusy(true);
    await playSound(s);
    setBusy(false);
  };

  const body = () => {
    if (screen === CHUNK_DONE) {
      const allRead = readCount(progress, lesson.id) >= total;
      const nextUp = lesson.sections[chunk ? chunk.to + 1 : 0];
      return (
        <div className="panel lesson">
          <p className="ok-text">✔ جزء النهارده خلص.</p>
          {allRead || !nextUp ? (
            <>
              <p>قريتي الدرس كله. في المرة الجاية: الاختبار.</p>
              <SummaryBox lesson={lesson} />
            </>
          ) : (
            <p>
              المرة الجاية هنبدأ من: <b>{nextUp.title}</b>
            </p>
          )}
        </div>
      );
    }

    if (screen === CONTENTS) {
      const last = resumeSection(progress, lesson);
      return (
        <div className="panel lesson">
          <button className="big primary" onClick={() => go(last ?? 0)}>
            {last === null ? 'ابدئي الدرس ←' : 'ارجعي لآخر مكان ←'}
          </button>
          <h2>الفهرس</h2>
          <ol className="lesson-toc">
            {lesson.sections.map((s, i) => (
              <li key={s.title}>
                <button onClick={() => go(i)}>
                  <span className="toc-mark">{isRead(progress, lesson.id, i) ? '✔' : i + 1}</span>
                  <Latin text={s.title} />
                </button>
              </li>
            ))}
          </ol>
          <div className="row">
            <button onClick={() => go(total)}>📝 ملخص</button>
            <button onClick={() => go(QUIZ)}>يلا الاختبار ←</button>
          </div>
        </div>
      );
    }

    if (screen < total) {
      const sc = lesson.sections[screen];
      const endOfChunk = !!chunk && screen === chunk.to;
      return (
        <div className="panel lesson">
          <p className="hint">
            {screen + 1} من {total}
          </p>
          <h2>
            <Latin text={sc.title} />
          </h2>
          <SectionBody key={screen} section={sc} />
          <SoundPicker />
          <div className="row">
            {!(chunk && screen === chunk.from) && <button onClick={() => go(screen === 0 ? CONTENTS : screen - 1)}>{screen === 0 ? '→ الفهرس' : '→ رجوع'}</button>}
            <button
              className="big primary"
              onClick={() => {
                const p = markRead(progress, lesson.id, screen);
                if (endOfChunk) {
                  update(p);
                  setScreen(CHUNK_DONE);
                  onChunkDone?.();
                } else go(screen + 1, p);
              }}
            >
              {endOfChunk ? 'خلصت جزء النهارده ✔' : 'التالي ←'}
            </button>
          </div>
        </div>
      );
    }

    if (screen === total)
      return (
        <div className="panel lesson">
          <SummaryBox lesson={lesson} />
          <div className="row">
            <button onClick={() => go(CONTENTS)}>→ نراجع الدرس</button>
            <button className="big primary" onClick={() => go(QUIZ)}>
              يلا الاختبار ←
            </button>
          </div>
        </div>
      );

    if (finished) {
      const right = scoreQuiz(quiz, answers);
      const ok = quizPassed(right, quiz.length);
      return (
        <div className="panel center lesson">
          <h2>
            {right} من {quiz.length} {ok ? '🎉' : ''}
          </h2>
          {ok ? <p className="ok-text">برافو! الدرس خلص ✔</p> : <p>محتاجين {needed} على الأقل. ولا يهمك — نراجع ونجرب تاني.</p>}
          <div className="row">
            <button
              onClick={() => {
                go(CONTENTS);
                restart();
              }}
            >
              → نراجع الدرس
            </button>
            {!ok && (
              <button className="big primary" onClick={restart}>
                نجرب الاختبار تاني
              </button>
            )}
          </div>
        </div>
      );
    }

    const q = quiz[qi];
    const chosen = answers[qi];
    const answered = chosen !== null && chosen !== undefined;
    const choose = (i: number) => {
      if (answered) return;
      const next = [...answers];
      next[qi] = i;
      setAnswers(next);
    };
    const nextQ = () => {
      if (qi + 1 < quiz.length) return setQi(qi + 1);
      setFinished(true);
      if (quizPassed(scoreQuiz(quiz, answers), quiz.length)) {
        markLessonDone(lesson.id);
        onPassed?.();
      }
    };
    return (
      <div className="panel center lesson">
        <p className="hint">
          سؤال {qi + 1} من {quiz.length}
        </p>
        <h2>
          <Latin text={q.q} />
        </h2>
        {q.sound && <button disabled={busy} onClick={() => void listenQuestion(q.sound!)}>🔊 اسمعي{busy ? '…' : ''}</button>}
        {!answered && <p className="hint">👆 الدوسة على الاختيار هي الإجابة.</p>}
        <div className="answers" key={qi}>
          {q.options.map((o, i) => (
            <button key={o} className={'big' + (answered && i === q.answer ? ' right' : answered && i === chosen ? ' wrong' : '')} disabled={answered} onClick={() => choose(i)}>
              <span>
                {answered && i === q.answer ? '✔ ' : answered && i === chosen ? '✘ ' : ''}
                <Latin text={o} />
              </span>
            </button>
          ))}
        </div>
        {answered && (
          <div className="lesson-box lesson-why">
            <p className={chosen === q.answer ? 'ok-text' : ''}>{chosen === q.answer ? '✔ صح! 🎉' : '✘ مش دي.'}</p>
            <p>
              <Latin text={q.why} />
            </p>
          </div>
        )}
        <p className="hint">
          النتيجة لحد دلوقتي: {scoreQuiz(quiz, answers)} من {answers.filter((a) => a !== null && a !== undefined).length} — النجاح {needed} من {quiz.length}
        </p>
        {answered && (
          <button className="big primary" onClick={nextQ}>
            {qi + 1 < quiz.length ? 'السؤال اللي بعده ←' : 'النتيجة ←'}
          </button>
        )}
      </div>
    );
  };

  const t = term ? termByKey(term) : null;
  return (
    <TermContext.Provider value={setTerm}>
      <div ref={top} className="lesson-anchor" />
      {body()}
      {t && (
        <div className="modal-backdrop" onClick={() => setTerm(null)}>
          <div className="modal" role="dialog" aria-label={t.ar} onClick={(e) => e.stopPropagation()}>
            <h3>
              {t.ar} · <bdi dir="ltr">{t.en}</bdi>
            </h3>
            <p>
              <Latin text={t.def} />
            </p>
            <div className="row">
              <a className="button-link" href={`#/lessons/glossary/${t.key}`}>
                📖 القاموس
              </a>
              <button className="primary" onClick={() => setTerm(null)}>
                تمام
              </button>
            </div>
          </div>
        </div>
      )}
    </TermContext.Provider>
  );
}
