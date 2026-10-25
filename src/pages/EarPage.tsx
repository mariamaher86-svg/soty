import { useEffect, useReducer, useRef, useState } from 'react';
import { YouTubeSearch } from '../components/Demo';
import { canAnswer, canReplay, initialQ, qReducer } from '../lib/questionFlow';
import { LessonLink } from '../components/LessonLink';
import { g } from '../lib/gender';
import { Page, Stat } from '../components/ui';
import { SoundPicker } from '../components/SoundPicker';
import { playNote } from '../audio/sound';
import { EAR_LEVELS, INTERVALS, isUnlocked, makeQuestion, maqamScaleFreqs, PASS_RIGHT, PASS_WINDOW, rightInWindow, currentLevel, type EarLevel, type Question } from '../lib/ear';
import { MAQAMAT } from '../lib/maqam';
import { shiftCents } from '../lib/music';
import { addEarAnswer, addResult, getEarHistory } from '../lib/storage';
import { exerciseRange } from './common';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const intervalName = (s: number) => INTERVALS.find((i) => i.semis === s)!;
const maqamName = (id: string) => MAQAMAT.find((m) => m.id === id)!.ar;

/** Plays the two notes of a question (or a maqam's scale). */
async function playQuestion(q: Question) {
  if (q.kind === 'maqam') {
    for (const f of maqamScaleFreqs(q.answer, q.tonic)) await playNote(f, 0.55);
    return;
  }
  await playNote(q.notes[0], 0.9);
  await wait(250);
  await playNote(q.notes[1], 0.9);
}

async function playPair(a: number, b: number) {
  await playNote(a, 0.9);
  await wait(250);
  await playNote(b, 0.9);
}

/** Answer buttons for a question: [value, Arabic label]. */
function options(q: Question): [string, string][] {
  if (q.kind === 'pitch')
    return [
      ['higher', 'التانية أعلى ⬆️'],
      ['lower', 'التانية أوطى ⬇️'],
    ];
  if (q.kind === 'same')
    return [
      ['same', 'زي بعض ='],
      ['different', 'مختلفين ≠'],
    ];
  if (q.kind === 'interval') return q.choices.map((s) => [String(s), `${intervalName(s).ar} (${intervalName(s).en})`]);
  return q.choices.map((id) => [id, `مقام ${maqamName(id)}`]);
}

/** After answering: a button to hear the right answer and her choice side by side. */
function compareButtons(q: Question, chosen: string): { label: string; play: () => Promise<void> }[] {
  if (q.kind === 'pitch' || q.kind === 'same') {
    const [a, b] = q.notes;
    if (q.kind === 'pitch') return [{ label: '🔊 اسمعيهم تاني', play: () => playPair(a, b) }];
    const other = q.answer === 'same' ? shiftCents(a, 40) : a;
    return [
      { label: q.answer === 'same' ? '🔊 كانوا زي بعض' : `🔊 كانوا مختلفين (${Math.abs(Math.round(q.cents))} سنت)`, play: () => playPair(a, b) },
      { label: q.answer === 'same' ? '🔊 كده يبقى فيه فرق' : '🔊 كده يبقوا زي بعض', play: () => playPair(a, other) },
    ];
  }
  if (q.kind === 'interval') {
    const base = q.notes[0];
    const list = [{ label: `🔊 الصح: ${intervalName(q.answer).ar}`, play: () => playPair(base, shiftCents(base, q.answer * 100)) }];
    if (chosen !== String(q.answer)) list.push({ label: `🔊 اختيارك: ${intervalName(Number(chosen)).ar}`, play: () => playPair(base, shiftCents(base, Number(chosen) * 100)) });
    return list;
  }
  const scale = (id: string) => async () => {
    for (const f of maqamScaleFreqs(id, q.tonic)) await playNote(f, 0.5);
  };
  const list = [{ label: `🔊 الصح: ${maqamName(q.answer)}`, play: scale(q.answer) }];
  if (chosen !== q.answer) list.push({ label: `🔊 اختيارك: ${maqamName(chosen)}`, play: scale(chosen) });
  return list;
}

const isRight = (q: Question, v: string) => (q.kind === 'interval' ? Number(v) === q.answer : v === q.answer);

export function EarPage({ level: fixedLevel, onResult }: { level?: EarLevel; onResult?: (right: number, total: number) => void } = {}) {
  const range = useRef(exerciseRange()).current;
  const [history, setHistory] = useState(getEarHistory);
  const [level, setLevel] = useState<EarLevel>(() => fixedLevel ?? currentLevel(getEarHistory()));
  const [q, setQ] = useState<Question | null>(null);
  const [qs, dispatch] = useReducer(qReducer, initialQ);
  const chosen = qs.chosen;
  const [playing, setPlaying] = useState(false); // only for the "🔊 بيتشغل…" label — never locks buttons
  const playToken = useRef(0);
  const session = useRef({ right: 0, total: 0, unsaved: { right: 0, total: 0 } });
  const levelRef = useRef(level);
  levelRef.current = level;

  const saveBlock = () => {
    const u = session.current.unsaved;
    if (u.total >= 5) addResult(`ear-${levelRef.current}` as 'ear-pitch', Math.round((u.right / u.total) * 100), `${u.right}/${u.total}`);
    session.current.unsaved = { right: 0, total: 0 };
  };
  useEffect(() => saveBlock, []); // save what's left when leaving

  const play = async (question: Question) => {
    const token = ++playToken.current;
    setPlaying(true);
    await playQuestion(question); // always settles (see playNote)
    if (token === playToken.current) {
      setPlaying(false);
      dispatch({ type: 'played' });
    }
  };

  const next = async (lv = level) => {
    const nq = makeQuestion(lv, history[lv] ?? [], range.low, range.high);
    setQ(nq);
    dispatch({ type: 'next' });
    await play(nq);
  };

  const replay = async () => {
    if (!q) return;
    dispatch({ type: 'replay' });
    await play(q);
  };

  const answer = (v: string) => {
    if (!q || !canAnswer(qs)) return;
    const right = isRight(q, v);
    dispatch({ type: 'answer', value: v, correct: right });
    setHistory(addEarAnswer(level, right));
    const s = session.current;
    s.total++;
    s.unsaved.total++;
    if (right) {
      s.right++;
      s.unsaved.right++;
    }
    if (s.unsaved.total >= PASS_WINDOW) saveBlock();
    onResult?.(s.right, s.total);
  };

  const chooseLevel = (lv: EarLevel) => {
    saveBlock();
    setLevel(lv);
    setQ(null);
    dispatch({ type: 'reset' });
  };

  const info = EAR_LEVELS.find((l) => l.id === level)!;
  const answers = history[level] ?? [];
  const correct = q && chosen ? isRight(q, chosen) : null;
  const rightAnswerText = q ? options(q).find(([v]) => isRight(q, v))?.[1] : '';

  return (
    <Page tips help="ear" title="تدريب الودن" intro="سماع بس، من غير ميكروفون. كل مستوى بيفتح لما تجيبي ٨ صح من آخر ١٠ في اللي قبله، وتقدري ترجعي لأي مستوى فتحتيه.">
      <YouTubeSearch k="ear" />
      <LessonLink id="note" what="نغمة أعلى وأوطى" />
      <SoundPicker />
      {!fixedLevel && (
        <div className="choices">
          {EAR_LEVELS.map((l) => {
            const open = isUnlocked(l.id, history);
            return (
              <button key={l.id} className={l.id === level ? 'chip active' : 'chip'} disabled={!open} onClick={() => chooseLevel(l.id)} title={open ? '' : 'اوصلي ٨ من ١٠ في المستوى اللي قبله'}>
                {open ? '' : '🔒 '}
                {l.n}. {l.ar}
              </button>
            );
          })}
        </div>
      )}

      <div className="panel center">
        <h2>
          المستوى {info.n}: {info.ar}
        </h2>
        <p className="hint">{info.desc}</p>
        <div className="stats">
          <Stat label={`صح من آخر ${PASS_WINDOW}`} value={`${rightInWindow(answers)} / ${Math.min(PASS_WINDOW, answers.length)}`} />
          <Stat label={`${g('محتاجة', 'محتاج')} عشان المستوى الجاي`} value={`${PASS_RIGHT} من ${PASS_WINDOW}`} />
        </div>

        {!q ? (
          <button className="big primary" onClick={() => next()}>
            ▶️ ابدئي
          </button>
        ) : (
          <>
            <p className="hint">{chosen ? '' : playing ? '🔊 اسمعي…' : '👆 الدوسة على الاختيار هي الإجابة.'}</p>
            <button onClick={replay} disabled={!canReplay(qs)}>
              🔁 اسمعي تاني
            </button>
            <div className="answers">
              {options(q).map(([v, label]) => (
                <button
                  key={v}
                  className={'big' + (chosen && isRight(q, v) ? ' right' : chosen === v ? ' wrong' : '')}
                  disabled={!canAnswer(qs)}
                  onClick={() => answer(v)}
                >
                  {label}
                </button>
              ))}
            </div>
            {chosen && (
              <>
                <p className={correct ? 'ok-text guide' : 'guide'}>{correct ? '✔ صح! 🎉' : `✘ الإجابة الصح: ${rightAnswerText}`}</p>
                <p className="hint">النهارده: {qs.right} صح من {qs.total}</p>
                <div className="row">
                  {compareButtons(q, chosen).map((b) => (
                    <button key={b.label} onClick={() => void b.play()}>
                      {b.label}
                    </button>
                  ))}
                </div>
                <button className="big primary" onClick={() => next()}>
                  السؤال اللي بعده ←
                </button>
              </>
            )}
          </>
        )}
      </div>
    </Page>
  );
}
