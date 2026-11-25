// "🎓 كورس الصوت": #/course (the levels), #/course/<n> (one level), #/course/ex/<id> (one exercise),
// #/course/exam/<n> (the placement check "امتحنيني"), #/course/graduation (a full song).

import { useEffect, useState } from 'react';
import { g } from '../lib/gender';
import { Page } from '../components/ui';
import { YouTubeSearch } from '../components/Demo';
import { CourseRunner } from '../components/CourseRunner';
import { COURSE, COURSE_SAFETY, GRADUATION, type CourseExercise, type CourseLevel } from '../content/course';
import {
  ar,
  currentLevel,
  exerciseById,
  getCourse,
  goalText,
  graduationOpen,
  isOpen,
  isPassed,
  levelByN,
  levelDone,
  levelOf,
  meetsGoal,
  neededToPass,
  PASS_DAYS,
  passDays,
  passedCount,
  placementExercises,
  placementPassed,
  recordGraduation,
  recordPass,
  recordPlacement,
  startCourse,
  type CourseMeasure,
  type CourseProgress,
} from '../lib/course';
import { getSongs, today } from '../lib/storage';
import { getPhraseProgress, PHRASE_GOOD } from './LearnSongPage';

function route(): { view: 'home' } | { view: 'level'; n: number } | { view: 'ex'; id: string } | { view: 'exam'; n: number } | { view: 'graduation' } {
  const parts = window.location.hash.replace(/^#\/?/, '').split('/');
  if (parts[1] === 'ex' && parts[2]) return { view: 'ex', id: decodeURIComponent(parts[2]) };
  if (parts[1] === 'exam' && parts[2]) return { view: 'exam', n: Number(parts[2]) };
  if (parts[1] === 'graduation') return { view: 'graduation' };
  if (parts[1] && /^\d+$/.test(parts[1])) return { view: 'level', n: Number(parts[1]) };
  return { view: 'home' };
}

export function CoursePage() {
  const r = route();
  if (r.view === 'ex') {
    const ex = exerciseById(r.id);
    if (!ex) return <Missing />;
    return <ExerciseScreen key={ex.id} ex={ex} />;
  }
  if (r.view === 'level') {
    const l = levelByN(r.n);
    return l ? <LevelScreen level={l} /> : <Missing />;
  }
  if (r.view === 'exam') {
    const l = levelByN(r.n);
    return l ? <ExamScreen level={l} /> : <Missing />;
  }
  if (r.view === 'graduation') return <GraduationScreen />;
  return <CourseHome />;
}

function Missing() {
  return (
    <Page title="كورس الصوت">
      <p>الصفحة دي مش موجودة.</p>
      <a href="#/course">→ رجوع للكورس</a>
    </Page>
  );
}

function Locked({ n }: { n: number }) {
  return (
    <Page help="course" title={`المستوى ${ar(n)}`}>
      <div className="panel center">
        <p>🔒 المستوى ده لسه مقفول. بيفتح لما المستوى اللي قبله يخلص.</p>
        <a className="button-link" href={`#/course/${currentLevel(getCourse())}`}>
          روحي لمستواكي
        </a>
      </div>
    </Page>
  );
}

/** "١ من ٢ أيام" / "✔ اتعدّى" for one exercise. */
function passBadge(p: CourseProgress, id: string) {
  if (isPassed(p, id)) return '✔ اتعدّى';
  const n = passDays(p, id);
  return n ? `${ar(n)} من ${ar(PASS_DAYS)} أيام` : 'لسه';
}

/** The next exercise to do in her level (the first one not passed). */
function nextExercise(p: CourseProgress): CourseExercise | null {
  const l = levelByN(currentLevel(p))!;
  return l.exercises.find((e) => !isPassed(p, e.id)) ?? null;
}

export function SafetyNotes() {
  return (
    <div className="notes" role="note">
      <b>بأمان:</b>
      <ul>
        {COURSE_SAFETY.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
    </div>
  );
}

function CourseHome() {
  const [p] = useState(startCourse);
  const cur = currentLevel(p);
  const level = levelByN(cur)!;
  const next = nextExercise(p);
  const grad = graduationOpen(p);
  return (
    <Page help="course" title="🎓 كورس الصوت" intro="من الأبسط للأصعب، خطوة خطوة، لحد ما تغني أي أغنية أو ترنيمة صعبة.">
      <div className="panel center course-now">
        <p className="step-count">
          المستوى {ar(cur)} من {ar(COURSE.length)}
        </p>
        <h2>
          {level.icon} {level.title}
        </h2>
        <p>{level.goal}</p>
        <div className="course-bar" role="img" aria-label={`${ar(passedCount(p, level))} من ${ar(level.exercises.length)} تمارين`}>
          <span style={{ width: `${Math.round((passedCount(p, level) / level.exercises.length) * 100)}%` }} />
        </div>
        <p className="hint">
          {ar(passedCount(p, level))} من {ar(level.exercises.length)} تمارين اتعدّت
          {grad ? '' : ` · المستوى اللي بعده بيفتح بعد ${ar(neededToPass(level))}`}
        </p>
        {grad ? (
          <a className="button-link primary big-link" href="#/course/graduation">
            {p.graduated ? '🎓 اتخرجتي — غني أغنية تانية' : '🎓 يلا التخرج'}
          </a>
        ) : (
          next && (
            <a className="button-link primary big-link" href={`#/course/ex/${next.id}`}>
              الجاي: {next.title}
            </a>
          )
        )}
        <p className="hint">كل تمرين بيتعدّى لما توصلي لهدفه في يومين مختلفين. و«تمرين النهارده» بيجيب تمارينه من مستواكي.</p>
      </div>
      <div className="ex-list course-levels">
        {COURSE.map((l) => {
          const open = isOpen(p, l.n);
          const done = levelDone(p, l);
          const status = done ? (p.placed[l.n] ? '✔ خلص (بالامتحان)' : '✔ خلص') : open ? `${ar(passedCount(p, l))} من ${ar(l.exercises.length)}` : '🔒';
          const inner = (
            <>
              <span className="row-icon" aria-hidden>
                {l.icon}
              </span>
              <span>
                <span className="row-main">
                  المستوى {ar(l.n)}: {l.title}
                </span>
                <span className="row-label">{status}</span>
              </span>
              <span className="chev" aria-hidden>
                {open ? '‹' : ''}
              </span>
            </>
          );
          return open ? (
            <a key={l.n} className={'list-row ex-row' + (l.n === cur && !grad ? ' current' : '')} href={`#/course/${l.n}`}>
              {inner}
            </a>
          ) : (
            <div key={l.n} className="list-row ex-row locked" aria-disabled="true">
              {inner}
            </div>
          );
        })}
        {grad ? (
          <a className="list-row ex-row" href="#/course/graduation">
            <span className="row-icon" aria-hidden>
              🎓
            </span>
            <span>
              <span className="row-main">التخرج</span>
              <span className="row-label">{p.graduated ? '✔' : 'أغنية كاملة'}</span>
            </span>
            <span className="chev" aria-hidden>
              ‹
            </span>
          </a>
        ) : (
          <div className="list-row ex-row locked" aria-disabled="true">
            <span className="row-icon" aria-hidden>
              🎓
            </span>
            <span>
              <span className="row-main">التخرج</span>
              <span className="row-label">🔒 بعد المستوى {ar(COURSE.length)}</span>
            </span>
          </div>
        )}
      </div>
      <SafetyNotes />
    </Page>
  );
}

function LevelScreen({ level }: { level: CourseLevel }) {
  const p = getCourse();
  if (!isOpen(p, level.n)) return <Locked n={level.n} />;
  const cur = currentLevel(p);
  const done = levelDone(p, level);
  return (
    <Page help="course" title={`المستوى ${ar(level.n)}: ${level.title}`} intro={level.goal}>
      <div className="notes" role="note">
        <b>ليه المستوى ده مهم:</b> {level.why}
      </div>
      {level.care && (
        <div className="warn-text" role="note">
          ⚠️ {level.care}
        </div>
      )}
      <p className="hint">
        {done ? '✔ المستوى ده خلص — ممكن ترجعي له وقت ما تحبي.' : `${ar(passedCount(p, level))} من ${ar(level.exercises.length)} تمارين اتعدّت — محتاجين ${ar(neededToPass(level))} عشان يفتح المستوى اللي بعده.`}
      </p>
      <ol className="ex-list course-exercises">
        {level.exercises.map((e) => (
          <li key={e.id}>
            <a className="list-row ex-row" href={`#/course/ex/${e.id}`}>
              <span>
                <span className="row-main">{e.title}</span>
                <span className="row-label">
                  {passBadge(p, e.id)} · 🎯 {goalText(e.goal)}
                </span>
              </span>
              <span className="chev" aria-hidden>
                ‹
              </span>
            </a>
          </li>
        ))}
      </ol>
      {level.n === cur && !done && (
        <div className="panel center">
          <p className="hint">{g('لو انتي عارفة', 'لو انت عارف')} التمارين دي كويس: امتحان قصير، ولو وصلتي لهدف كل تمرين فيه، المستوى يتعدّى على طول.</p>
          <a className="button-link" href={`#/course/exam/${level.n}`}>
            {g('أنا عارفة المستوى ده — امتحنيني', 'أنا عارف المستوى ده — امتحنّي')}
          </a>
        </div>
      )}
      <SafetyNotes />
    </Page>
  );
}

/** One go's result in words. */
function measureText(ex: CourseExercise, m: CourseMeasure): string {
  const goal = ex.goal;
  switch (goal.kind) {
    case 'seconds':
      return `${ar(Math.round(m.value))} ثانية`;
    case 'cents':
      return m.value >= 9999 ? 'مسمعناش صوت كفاية' : `${ar(Math.round(m.value))} سنت`;
    case 'notes':
      return `${ar(m.value)} من ${ar(goal.of)} نغمات مظبوطة`;
    case 'percent':
      return m.tries !== undefined ? `${ar(m.value)}٪ صح في ${ar(m.tries)} محاولات` : `${ar(m.value)}٪`;
    case 'phrases':
      return `${ar(m.value)} جمل وصلت للهدف النهارده`;
  }
}

/** The goal box: what to reach, and how many good days so far. */
function GoalBox({ ex, p, metNow }: { ex: CourseExercise; p: CourseProgress; metNow: boolean }) {
  const days = passDays(p, ex.id);
  const todayMet = (p.passes[ex.id] ?? []).includes(today());
  return (
    <div className="panel course-goal">
      <p>
        🎯 <b>الهدف:</b> {goalText(ex.goal)}
      </p>
      <p className="hint">
        {isPassed(p, ex.id) ? '✔ التمرين ده اتعدّى — كرريه وقت ما تحبي.' : `بيتعدّى لما توصلي للهدف في ${ar(PASS_DAYS)} أيام مختلفة — لحد دلوقتي: ${ar(days)} من ${ar(PASS_DAYS)}.`}
      </p>
      {(metNow || todayMet) && !isPassed(p, ex.id) && <p className="ok-text">✔ وصلتي للهدف النهارده — ارجعي يوم تاني عشان يتثبت.</p>}
    </div>
  );
}

function ExerciseScreen({ ex }: { ex: CourseExercise }) {
  const level = levelOf(ex.id)!;
  const [p, setP] = useState(getCourse);
  const [last, setLast] = useState<{ m: CourseMeasure; met: boolean } | null>(null);
  if (!isOpen(p, level.n)) return <Locked n={level.n} />;
  const onMeasure = (m: CourseMeasure, real: boolean) => {
    const met = real && meetsGoal(ex.goal, m);
    setLast({ m, met });
    if (met) setP(recordPass(ex.id));
  };
  const idx = level.exercises.indexOf(ex);
  const after = level.exercises[idx + 1];
  return (
    <Page tips mic help="course" title={ex.title} intro={ex.what}>
      <GoalBox ex={ex} p={p} metNow={!!last?.met} />
      <div className="panel">
        <h2>إزاي</h2>
        <ol className="course-how">
          {ex.how.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </div>
      <YouTubeSearch k={ex.video} />
      <CourseRunner ex={ex} onMeasure={onMeasure} />
      {last && (
        <p className={'course-last ' + (last.met ? 'ok-text' : 'hint')} role="status">
          آخر مرة: {measureText(ex, last.m)} {last.met ? '— 🎉 وصلتي للهدف!' : '— قربتي، جربي تاني بهدوء.'}
        </p>
      )}
      <div className="row">
        <a href={`#/course/${level.n}`}>→ رجوع للمستوى {ar(level.n)}</a>
        {after && <a href={`#/course/ex/${after.id}`}>التمرين اللي بعده ←</a>}
      </div>
    </Page>
  );
}

/** "امتحنيني": every exercise of her level, one after the other; all goals reached = the level is passed. */
function ExamScreen({ level }: { level: CourseLevel }) {
  const list = placementExercises(level);
  const [i, setI] = useState(0);
  const [met, setMet] = useState<Set<string>>(new Set());
  const [end, setEnd] = useState<'passed' | 'stopped' | null>(null);
  const p = getCourse();
  if (end === null && (level.n !== currentLevel(p) || levelDone(p, level)))
    return (
      <Page help="course" title="امتحان المستوى">
        <div className="panel center">
          <p>الامتحان بيبقى لمستواكي الحالي بس (المستوى {ar(currentLevel(p))}).</p>
          <a className="button-link" href={`#/course/${currentLevel(p)}`}>
            روحي لمستواكي
          </a>
        </div>
      </Page>
    );
  if (end === 'passed') {
    const nextN = level.n + 1;
    return (
      <Page help="course" title={`عدّيتي المستوى ${ar(level.n)} 🎉`}>
        <div className="panel center">
          <p>برافو! وصلتي لهدف كل التمارين، فالمستوى ده اتعدّى.</p>
          <a className="button-link primary" href={levelByN(nextN) ? `#/course/${nextN}` : '#/course/graduation'}>
            {levelByN(nextN) ? `يلا المستوى ${ar(nextN)} ←` : '🎓 يلا التخرج'}
          </a>
        </div>
      </Page>
    );
  }
  if (end === 'stopped')
    return (
      <Page help="course" title="امتحان المستوى">
        <div className="panel center">
          <p>
            وصلتي لهدف {ar(met.size)} من {ar(list.length)}. ولا يهمك — كملي تمارين المستوى عادي، وكل تمرين وصلتي لهدفه النهارده اتحسب.
          </p>
          <a className="button-link" href={`#/course/${level.n}`}>
            → رجوع للمستوى
          </a>
        </div>
      </Page>
    );
  const ex = list[i];
  const got = met.has(ex.id);
  const onMeasure = (m: CourseMeasure, real: boolean) => {
    if (!real || !meetsGoal(ex.goal, m) || met.has(ex.id)) return;
    recordPass(ex.id);
    setMet(new Set([...met, ex.id]));
  };
  const next = () => {
    if (i + 1 < list.length) return setI(i + 1);
    if (placementPassed(level, met)) {
      recordPlacement(level.n);
      setEnd('passed');
    } else setEnd('stopped');
  };
  return (
    <Page tips mic help="course" title={`امتحان المستوى ${ar(level.n)}`} intro="وصلي لهدف كل تمرين مرة واحدة، وجربي على قد ما تحبي.">
      <div className="panel step-head">
        <p className="step-count">
          التمرين {ar(i + 1)} من {ar(list.length)}
        </p>
        <h2>{ex.title}</h2>
        <p>
          🎯 <b>الهدف:</b> {goalText(ex.goal)}
        </p>
        {got && <p className="ok-text">✔ وصلتي للهدف</p>}
      </div>
      <CourseRunner key={ex.id} ex={ex} onMeasure={onMeasure} />
      <div className="row">
        <button className="big primary" disabled={!got} onClick={next}>
          {i + 1 < list.length ? 'التمرين اللي بعده ←' : 'خلصت ✔'}
        </button>
        <button onClick={() => setEnd('stopped')}>وقفي الامتحان</button>
      </div>
    </Page>
  );
}

/** Every level done: a full song from the library, all its phrases learned in the phrase loop. */
function songStatus() {
  return getSongs()
    .filter((s) => s.file)
    .map((s) => {
      const pr = getPhraseProgress(s.id);
      const total = pr?.phrases.length ?? 0;
      const learned = pr ? pr.phrases.filter((_, k) => (pr.best[k] ?? 0) >= PHRASE_GOOD).length : 0;
      return { s, total, learned, whole: total > 0 && learned === total };
    });
}

function GraduationScreen() {
  const [p, setP] = useState(getCourse);
  const [status] = useState(songStatus);
  const open = graduationOpen(p);
  // a whole song learned (back from the phrase loop): she graduated
  useEffect(() => {
    if (open && !p.graduated && status.some((x) => x.whole)) setP(recordGraduation());
  }, []);
  if (!open)
    return (
      <Page help="course" title={GRADUATION.title}>
        <div className="panel center">
          <p>🔒 التخرج بيفتح بعد ما المستويات الـ{ar(COURSE.length)} تخلص.</p>
          <a className="button-link" href="#/course">
            → رجوع للكورس
          </a>
        </div>
      </Page>
    );
  return (
    <Page help="course" title={GRADUATION.title} intro={GRADUATION.what}>
      {p.graduated && (
        <div className="panel center">
          <h2>🎓 مبروك! اتخرجتي من كورس الصوت</h2>
          <p>غنيتي أغنية كاملة جملة جملة. كملي بأغاني أصعب، وارجعي للمستويات كل ما تحبي.</p>
        </div>
      )}
      <div className="panel">
        <h2>إزاي</h2>
        <ol className="course-how">
          {GRADUATION.how.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </div>
      {status.length ? (
        <div className="ex-list">
          {status.map(({ s, total, learned, whole }) => (
            <a key={s.id} className="list-row" href={`#/songs/${s.id}/learn`}>
              <span>
                <span className="row-main">{s.title}</span>
                <span className="row-label">{total ? `${ar(learned)} من ${ar(total)} جمل اتعلمت${whole ? ' ✔' : ''}` : 'لسه متقسمتش جمل — افتحيها'}</span>
              </span>
              <span className="chev" aria-hidden>
                ‹
              </span>
            </a>
          ))}
        </div>
      ) : (
        <div className="panel center">
          <p>مفيش أغنية فيها ملف صوت لسه.</p>
          <a className="button-link" href="#/songs/new">
            ➕ ضيفي أغنية
          </a>
        </div>
      )}
      <SafetyNotes />
    </Page>
  );
}
