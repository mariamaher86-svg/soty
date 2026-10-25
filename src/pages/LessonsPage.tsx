import { useState } from 'react';
import { CentsMeter, Page } from '../components/ui';
import { Keyboard } from '../components/Keyboard';
import { SoundPicker } from '../components/SoundPicker';
import { playNote } from '../audio/sound';
import { audioContext } from '../audio/audio';
import { click } from '../audio/metronome';
import { LESSONS, lessonById, quizPassed, scoreQuiz, soundFreqs, type Lesson, type Sound } from '../content/lessons';
import { getLessonsDone, markLessonDone } from '../lib/storage';
import { inUserOctave } from '../lib/voice';
import { exerciseRange } from './common';

/** C in the user's own octave, so examples sound in their voice range. */
function baseC(): number {
  const r = exerciseRange();
  return inUserOctave(60, r.low, r.high - 12 >= r.low ? r.high - 12 : r.high);
}

async function playSound(s: Sound) {
  if (s.clicks) {
    const { bpm, beats, perBar = 4 } = s.clicks;
    const t0 = audioContext().currentTime + 0.15;
    for (const b of beats) click(t0 + (b * 60) / bpm, Math.abs(b % perBar) < 1e-6);
    await new Promise((r) => setTimeout(r, ((Math.max(...beats) + 1) * 60 * 1000) / bpm + 150));
    return;
  }
  const base = baseC();
  for (const f of soundFreqs(s, base)) await playNote(f, s.dur ?? 0.7);
}

/** #/lessons and #/lessons/<id> */
export function LessonsPage() {
  const id = window.location.hash.replace(/^#\/?/, '').split('/')[1];
  const lesson = id ? lessonById(id) : undefined;
  const [done, setDone] = useState(getLessonsDone);
  if (lesson)
    return (
      <Page tips title={`${lesson.icon} ${lesson.title}`}>
        <LessonView lesson={lesson} onPassed={() => setDone(getLessonsDone())} />
      </Page>
    );
  const count = LESSONS.filter((l) => done[l.id]).length;
  return (
    <Page tips help="lessons" title="🎓 أساسيات الموسيقى" intro="دروس صغيرة قبل المقامات: يعني إيه نغمة، دو ري مي، الأوكتاف، التون ونص التون، السلم، الربع تون، المقام، السنت، والإيقاع. كل درس دقيقتين واختبار صغير.">
      <p className="hint">
        خلصتي {count} من {LESSONS.length}.
      </p>
      <ol className="lesson-list">
        {LESSONS.map((l) => (
          <li key={l.id}>
            <a href={`#/lessons/${l.id}`} className="song-row">
              <span className="song-title">
                {l.icon} {l.title}
              </span>
              <span className="song-score">{done[l.id] ? '✔' : ''}</span>
            </a>
          </li>
        ))}
      </ol>
    </Page>
  );
}

/** One lesson: its screens, then the mini quiz. Embedded in the beginner path too. */
export function LessonView({ lesson, onPassed }: { lesson: Lesson; onPassed?: () => void }) {
  const [screen, setScreen] = useState(0); // screens, then quiz at screens.length
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [qi, setQi] = useState(0);
  const [finished, setFinished] = useState(false);
  const [busy, setBusy] = useState(false);
  const inQuiz = screen >= lesson.screens.length;

  const play = async (s: Sound) => {
    setBusy(true);
    await playSound(s);
    setBusy(false);
  };

  const restart = () => {
    setAnswers([]);
    setQi(0);
    setFinished(false);
  };

  if (!inQuiz) {
    const sc = lesson.screens[screen];
    return (
      <div className="panel lesson">
        <p className="hint">
          {screen + 1} من {lesson.screens.length}
        </p>
        <h2>{sc.title}</h2>
        {sc.text.map((t) => (
          <p key={t}>{t}</p>
        ))}
        {sc.keyboard && <Keyboard highlight={sc.keyboard} />}
        {sc.meter && (
          <div className="center">
            {sc.meter.map((c) => (
              <div key={c} className="meter-demo">
                <CentsMeter cents={c} tolerance={20} />
                <span className="hint" dir="ltr">
                  {c > 0 ? '+' : ''}
                  {c} cents
                </span>
              </div>
            ))}
          </div>
        )}
        {sc.links && (
          <div className="row lesson-links">
            {sc.links.map((l) => (
              <a key={l.href} className="button-link" href={l.href}>
                {l.label}
              </a>
            ))}
          </div>
        )}
        <div className="examples">
          {sc.examples.map((e) => (
            <button key={e.label} disabled={busy} onClick={() => play(e.sound)}>
              🔊 اسمعي: {e.label}
            </button>
          ))}
        </div>
        <SoundPicker />
        <div className="row">
          {screen > 0 && <button onClick={() => setScreen(screen - 1)}>→ رجوع</button>}
          <button className="big primary" onClick={() => setScreen(screen + 1)}>
            {screen + 1 < lesson.screens.length ? 'التالي ←' : 'يلا الاختبار ←'}
          </button>
        </div>
      </div>
    );
  }

  if (finished) {
    const right = scoreQuiz(lesson.quiz, answers);
    const ok = quizPassed(right, lesson.quiz.length);
    return (
      <div className="panel center lesson">
        <h2>
          {right} من {lesson.quiz.length} {ok ? '🎉' : ''}
        </h2>
        {ok ? <p className="ok-text">برافو! الدرس خلص ✔</p> : <p>محتاجين {Math.ceil(lesson.quiz.length * 0.8)} على الأقل. ولا يهمك — نراجع ونجرب تاني.</p>}
        {!ok && (
          <div className="row">
            <button
              onClick={() => {
                setScreen(0);
                restart();
              }}
            >
              → نراجع الدرس
            </button>
            <button className="big primary" onClick={restart}>
              نجرب الاختبار تاني
            </button>
          </div>
        )}
      </div>
    );
  }

  const q = lesson.quiz[qi];
  const chosen = answers[qi];
  const answered = chosen !== null && chosen !== undefined;
  const choose = (i: number) => {
    if (answered) return;
    const next = [...answers];
    next[qi] = i;
    setAnswers(next);
  };
  const nextQ = () => {
    if (qi + 1 < lesson.quiz.length) return setQi(qi + 1);
    setFinished(true);
    const right = scoreQuiz(lesson.quiz, answers);
    if (quizPassed(right, lesson.quiz.length)) {
      markLessonDone(lesson.id);
      onPassed?.();
    }
  };

  return (
    <div className="panel center lesson">
      <p className="hint">
        سؤال {qi + 1} من {lesson.quiz.length}
      </p>
      <h2>{q.q}</h2>
      {q.sound && <button onClick={() => play(q.sound!)}>🔊 اسمعي{busy ? '…' : ''}</button>}
      {!answered && <p className="hint">👆 الدوسة على الاختيار هي الإجابة.</p>}
      <div className="answers">
        {q.options.map((o, i) => (
          <button key={o} className={'big' + (answered && i === q.answer ? ' right' : answered && i === chosen ? ' wrong' : '')} disabled={answered} onClick={() => choose(i)}>
            {answered && i === q.answer ? '✔ ' : answered && i === chosen ? '✘ ' : ''}
            {o}
          </button>
        ))}
      </div>
      {answered && <p className={chosen === q.answer ? 'ok-text guide' : 'guide'}>{chosen === q.answer ? '✔ صح! 🎉' : `✘ الإجابة الصح: ${q.options[q.answer]}`}</p>}
      <p className="hint">
        النتيجة لحد دلوقتي: {scoreQuiz(lesson.quiz, answers)} من {answers.filter((a) => a !== null && a !== undefined).length} — النجاح {Math.ceil(lesson.quiz.length * 0.8)} من {lesson.quiz.length}
      </p>
      {answered && (
        <button className="big primary" onClick={nextQ}>
          {qi + 1 < lesson.quiz.length ? 'السؤال اللي بعده ←' : 'النتيجة ←'}
        </button>
      )}
    </div>
  );
}
