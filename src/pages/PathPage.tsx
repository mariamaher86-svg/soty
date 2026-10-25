import { useEffect, useRef, useState, type ReactNode } from 'react';
import { g } from '../lib/gender';
import { EmbeddedContext, Page, Stat } from '../components/ui';
import { RangePage } from './RangePage';
import { MatchPage, type MatchStats } from './MatchPage';
import { MaqamPage } from './MaqamPage';
import { Hiss, Stability, Sustain } from './BreathPage';
import { WarmupPage } from './WarmupPage';
import { EarPage } from './EarPage';
import { RhythmPage } from './RhythmPage';
import { IntervalPage } from './IntervalPage';
import { currentIntervalLevel, INTERVAL_LEVELS } from '../lib/intervalSing';
import { currentLevel, EAR_LEVELS } from '../lib/ear';
import { getEarHistory, getIntervalHistory, getResults, getSongs } from '../lib/storage';
import { StepNav } from '../components/StepNav';
import { ActivityBadge, arDigits } from '../components/ActivityBadge';
import { LessonView } from './LessonsPage';
import { FindNotePage } from './FindNotePage';
import { lessonById, todaysLesson, type LessonId } from '../content/lessons';
import { getLessonsDone } from '../lib/storage';
import { earIsReal, intervalsIsReal, rhythmIsReal, matchIsReal, maqamIsReal, MIN_MATCH_TRIES, rangeIsReal, secondsIsReal, stabilityIsReal, warmupIsReal, workoutCounts } from '../lib/stepRules';
import { getWeeklySong, singSong } from './songNav';
import { MAQAMAT } from '../lib/maqam';
import { noteName } from '../lib/music';
import { defaultRange } from '../lib/voice';
import { getGender } from '../lib/gender';
import { getPath, getRange, today, updatePath } from '../lib/storage';
import {
  compareMeasurements,
  countedWorkouts,
  MEASURES,
  measureValue,
  usableMeasurements,
  daysBetween,
  middleRange,
  middleTonic,
  shouldGoLight,
  streak,
  todaysMaqam,
  weeklyStatus,
  workoutPlan,
  isRhythmDay,
  type Feeling,
  type Measurement,
} from '../lib/path';

type MeasureStep = 'range' | 'match' | 'sustain' | 'stability' | 'hiss';
type WorkoutStep = ReturnType<typeof workoutPlan>[number]['step'];

type View =
  | { kind: 'home' }
  | { kind: 'measure'; weekly: boolean; step: number }
  | { kind: 'measureDone'; weekly: boolean; m: Measurement }
  | { kind: 'measureEmpty'; weekly: boolean }
  | { kind: 'workoutNotCounted'; done: number; total: number }
  | { kind: 'workout'; step: number }
  | { kind: 'feeling' }
  | { kind: 'feelingDone'; feeling: Feeling };

const MEASURE_STEPS: MeasureStep[] = ['range', 'match', 'sustain', 'stability', 'hiss'];

const MEASURE_INFO: Record<MeasureStep, { title: string; how: string }> = {
  range: { title: 'المساحة الصوتية', how: 'غني أوطى نغمة مريحة وبعدين أعلى نغمة مريحة. متضغطيش على صوتك.' },
  match: { title: 'مطابقة النغمة', how: 'اسمعي النغمة وغنيها. جربي ٥ نغمات على الأقل، ودوسي "تخطي" لو نغمة صعبة.' },
  sustain: { title: 'طول النفس', how: 'خدي نفس من بطنك وامدّي نغمة مريحة على قد ما تقدري. جربي مرتين.' },
  stability: { title: 'ثبات الصوت', how: 'غني نغمة مريحة ٥ ثواني من غير ما تهزيها.' },
  hiss: { title: 'تمرين سسسس', how: 'اتبعي الدايرة: شهيق، كتم، وبعدين "سسسس" طويلة وهادية.' },
};

const WORKOUT_INFO: Record<WorkoutStep, { title: string; how: string }> = {
  findnote: { title: 'إزاي أجيب دو صح؟', how: 'اسمعي النغمة، همهمي «مممم»، واطلعي أو انزلي ببطء لحد ما النقطة تيجي على الخط، واثبتي ثانية.' },
  lesson: { title: 'درس النهارده', how: 'درس صغير من أساسيات الموسيقى: اسمعي الأمثلة، وبعدين اختبار ٥ أسئلة.' },
  warmup: { title: 'الإحماء', how: 'بررر، سيرينة، وهمهمة — بهدوء ومن غير صوت عالي. دوسي "التالي" جوه كل جزء.' },
  intervals: { title: 'غنا الفواصل', how: 'اسمعي النغمة وغني المسافة المطلوبة. لو صعبة دوسي "اسمعي الإجابة".' },
  rhythm: { title: 'الإيقاع', how: 'اسمعي ٤ عدّات وصقّفي على الضربة مازورتين. أول مرة ظبطي التأخير تحت.' },
  ear: { title: 'تدريب الودن', how: 'سماع بس. جاوبي على كام سؤال في مستواكي، وارتاحي بصوتك.' },
  hiss: { title: 'تسخين النفس — سسسس', how: 'كرري التمرين ٣–٤ مرات. كتافك نازلة ومرتاحة، والنفس من بطنك.' },
  match: { title: 'مطابقة النغمة', how: 'نغمات من نص صوتك بالظبط. خدي وقتك، اسمعي الأول وبعدين غني بهدوء.' },
  sustain: { title: 'نغمة مريحة ممدودة', how: 'امدّي النغمة دي بصوت هادي وثابت، مش لازم عالي. كرري ٣ مرات وارتاحي بينهم.' },
  maqam: { title: 'مقام النهارده — على مهلك', how: 'صعود بس وعلى مهلك. اسمعي كل درجة كويس قبل ما تغنيها.' },
};

const WORKOUT_NEED: Record<WorkoutStep, string> = {
  lesson: 'لسه محتاجين نجاح في اختبار الدرس (٤ من ٥).',
  findnote: 'لسه محتاجين نلاقي ٣ نغمات على الأقل.',
  warmup: 'لسه محتاجين جزئين على الأقل من الإحماء (بررر، سيرينة، همهمة).',
  hiss: 'لسه محتاجين نسمع السسسس.',
  match: 'لسه محتاجين ٣ محاولات على الأقل وانتي بتغني.',
  sustain: 'لسه محتاجين نسمع نغمة ممدودة ثانية على الأقل.',
  maqam: 'لسه محتاجين تغني درجة واحدة على الأقل من المقام.',
  ear: 'لسه محتاجين إجابة على ٣ أسئلة على الأقل.',
  intervals: 'لسه محتاجين مسافة واحدة صح أو ٥ محاولات.',
  rhythm: 'لسه محتاجين جولة تصقيف واحدة نسمع فيها تصقيف على الضربة.',
};

const FEELINGS: { id: Feeling; ar: string }[] = [
  { id: 'no', ar: 'لأ' },
  { id: 'little', ar: 'شوية' },
  { id: 'yes', ar: 'أيوه' },
];

function emptyMeasurement(): Measurement {
  return { date: today(), rangeLow: null, rangeHigh: null, matchCents: null, matchLockSec: null, sustainSec: null, stabilityCents: null, hissSec: null };
}

const minutesAr = (n: number) => (n === 1 ? 'دقيقة' : n === 2 ? 'دقيقتين' : n <= 10 ? `${n} دقايق` : `${n} دقيقة`);

/** Elapsed time of the current step vs. its suggested minutes. */
function StepTimer({ minutes }: { minutes?: number }) {
  const [s, setS] = useState(0);
  useEffect(() => {
    const t0 = Date.now();
    const id = setInterval(() => setS(Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(id);
  }, []);
  const clock = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  return (
    <span className="hint">
      ⏱ <span dir="ltr">{clock}</span>
      {minutes ? ` من حوالي ${minutesAr(minutes)}` : ''}
    </span>
  );
}

function StepFrame({ n, total, title, how, minutes, result, ok, need, onNext, onSkip, children }: { n: number; total: number; title: string; how: string; minutes?: number; result?: string; ok: boolean; need: string; onNext: () => void; onSkip: () => void; children: ReactNode }) {
  return (
    <>
      <div className="panel step-head">
        <p className="step-count">
          الخطوة {arDigits(n)} من {arDigits(total)}
        </p>
        <div className="step-dots" aria-hidden>
          {Array.from({ length: total }, (_, i) => (
            <span key={i} className={i < n - 1 ? 'past' : i === n - 1 ? 'now' : ''} />
          ))}
        </div>
        <h2>{title}</h2>
        <p className="now">دلوقتي: {how}</p>
        <ActivityBadge done={ok} />
        <StepTimer key={n} minutes={minutes} />
        {result && <p className="ok-text">{result}</p>}
      </div>
      <EmbeddedContext.Provider value={true}>{children}</EmbeddedContext.Provider>
      <StepNav ok={ok} need={need} last={n === total} onNext={onNext} onSkip={onSkip} />
    </>
  );
}

export function BeginnerGuide() {
  return (
    <div className="notes" role="note">
      <b>دليل صغير للمبتدئين</b>
      <ul>
        <li>✅ إنتي {g('ماشية', 'ماشي')} صح لو: الصوت بيطلع أسهل، مفيش وجع، والنفس بيكفّي.</li>
        <li>⛔ وقفي فورًا لو: في وجع أو حرقان في الزور، صوتك مبحوح بعد التمرين، أو بتزقّي صوتك عشان توصلي للنغمات العالية.</li>
        <li>🗓️ شوية كل يوم أحسن من كتير مرة في الأسبوع.</li>
        <li>📈 الأرقام بتطلع وتنزل من يوم ليوم — ده طبيعي. بصي على اتجاهها كل أسبوع.</li>
      </ul>
    </div>
  );
}

export function PathPage() {
  // "🌱 نبدأ من هنا" (welcome / home card) opens #/path/start: go straight into the starting measurement
  const [view, setView] = useState<View>(() => (window.location.hash === '#/path/start' && !getPath().baseline ? { kind: 'measure', weekly: false, step: 0 } : { kind: 'home' }));
  useEffect(() => {
    if (window.location.hash === '#/path/start') history.replaceState(null, '', '#/path');
  }, []);
  const [data, setData] = useState(() => usableMeasurements(getPath()));
  const [stepOk, setStepOk] = useState(false);
  const doneSteps = useRef(0);
  const [confirmRedo, setConfirmRedo] = useState(false);
  const m = useRef<Measurement>(emptyMeasurement());
  const [captured, setCaptured] = useState('');
  const day = today();

  const lastMeasureDate = data.weekly.length ? data.weekly[data.weekly.length - 1].date : (data.baseline?.date ?? null);
  const status = weeklyStatus(lastMeasureDate, day);
  const real = countedWorkouts(data.workouts, new Set(getResults().map((x) => x.date)));
  const workoutsDone = real.length;
  const light = shouldGoLight(real, day);
  // today's music-basics lesson (frozen when the workout starts, so passing it doesn't shift the steps)
  const [wLesson, setWLesson] = useState<LessonId | null>(null);
  const [wFind, setWFind] = useState(false);
  const lessonNow = todaysLesson(getLessonsDone(), day);
  const findNow = workoutsDone < 7 && !!getLessonsDone().note; // first week, after "what is a note"
  const inWorkout = view.kind === 'workout' || view.kind === 'workoutNotCounted';
  const plan = workoutPlan(light, inWorkout ? !!wLesson : !!lessonNow, inWorkout ? wFind : findNow, isRhythmDay(workoutsDone));
  const maqamId = todaysMaqam(workoutsDone);
  const maqam = MAQAMAT.find((x) => x.id === maqamId)!;
  const doneToday = real.some((w) => w.date === day);
  const lastLog = real[real.length - 1];
  const restWarning = lastLog?.feeling === 'yes' && daysBetween(lastLog.date, day) <= 2;

  const range = getRange() ?? defaultRange(getGender());
  const mid = middleRange(range.low, range.high);
  const sustainNote = Math.round((mid.low + mid.high) / 2);

  const refresh = () => setData(usableMeasurements(getPath()));

  const goMeasure = (weekly: boolean) => {
    m.current = emptyMeasurement();
    setCaptured('');
    setStepOk(false);
    setConfirmRedo(false);
    setView({ kind: 'measure', weekly, step: 0 });
  };

  /** Fields each measurement step fills (cleared when the step is skipped, so a skip saves nothing). */
  const FIELDS: Record<MeasureStep, (keyof Measurement)[]> = {
    range: ['rangeLow', 'rangeHigh'],
    match: ['matchCents', 'matchLockSec'],
    sustain: ['sustainSec'],
    stability: ['stabilityCents'],
    hiss: ['hissSec'],
  };

  const nextMeasure = (weekly: boolean, step: number, skipped = false) => {
    if (skipped) for (const f of FIELDS[MEASURE_STEPS[step]]) (m.current as unknown as Record<string, null>)[f] = null;
    setCaptured('');
    setStepOk(false);
    if (step + 1 < MEASURE_STEPS.length) return setView({ kind: 'measure', weekly, step: step + 1 });
    const done: Measurement = { ...m.current, date: day };
    // never save an empty measurement as a baseline or weekly point
    if (MEASURES.every((x) => measureValue(done, x.key) === null)) return setView({ kind: 'measureEmpty', weekly });
    updatePath((p) => {
      if (weekly) p.weekly.push(done);
      else p.baseline = done;
    });
    refresh();
    setView({ kind: 'measureDone', weekly, m: done });
  };

  const goWorkout = () => {
    setWLesson(todaysLesson(getLessonsDone(), day));
    setWFind(findNow);
    doneSteps.current = 0;
    setCaptured('');
    setStepOk(false);
    setView({ kind: 'workout', step: 0 });
  };

  const nextWorkout = (step: number, skipped = false) => {
    if (!skipped) doneSteps.current++;
    setCaptured('');
    setStepOk(false);
    if (step + 1 < plan.length) return setView({ kind: 'workout', step: step + 1 });
    // a workout counts (streak, maqam rotation) only when at least half of its steps were really done
    if (!workoutCounts(doneSteps.current, plan.length)) return setView({ kind: 'workoutNotCounted', done: doneSteps.current, total: plan.length });
    updatePath((p) => p.workouts.push({ date: day, maqam: maqamId, feeling: null, done: doneSteps.current }));
    refresh();
    setView({ kind: 'feeling' });
  };

  const answer = (feeling: Feeling) => {
    updatePath((p) => {
      const last = p.workouts[p.workouts.length - 1];
      if (last) last.feeling = feeling;
    });
    refresh();
    setView({ kind: 'feelingDone', feeling });
  };

  // ---- measurement flow (starting measurement and weekly check)
  if (view.kind === 'measure') {
    const step = MEASURE_STEPS[view.step];
    const info = MEASURE_INFO[step];
    const set = <K extends keyof Measurement>(k: K, v: Measurement[K], text: string) => {
      m.current[k] = v;
      setCaptured(text);
      setStepOk(true);
    };
    const best = (k: 'sustainSec' | 'hissSec', v: number) => {
      if (secondsIsReal(v)) set(k, Math.max(m.current[k] ?? 0, v), `أحسن مرة: ${Math.max(m.current[k] ?? 0, v)} ثانية`);
    };
    const NEED: Record<MeasureStep, string> = {
      range: 'لسه محتاجين نسمع أوطى وأعلى نغمة (الاختبار لحد «شوفي النتيجة»).',
      match: `لسه محتاجين ${MIN_MATCH_TRIES.measure} محاولات على الأقل وانتي بتغني.`,
      sustain: 'لسه محتاجين نسمع نغمة ممدودة ثانية على الأقل.',
      stability: 'لسه محتاجين قياس الـ٥ ثواني كامل.',
      hiss: 'لسه محتاجين نسمع السسسس.',
    };
    return (
      <Page tips mic help="path" title={view.weekly ? 'القياس الأسبوعي' : 'قياس البداية'}>
        <StepFrame
          key={view.step}
          n={view.step + 1}
          total={MEASURE_STEPS.length}
          title={info.title}
          how={info.how}
          result={captured}
          ok={stepOk}
          need={NEED[step]}
          onNext={() => nextMeasure(view.weekly, view.step)}
          onSkip={() => nextMeasure(view.weekly, view.step, true)}
        >
          {step === 'range' && (
            <RangePage
              onResult={(lo, hi) => {
                if (!rangeIsReal(lo, hi)) return;
                m.current.rangeLow = lo;
                m.current.rangeHigh = hi;
                setCaptured(`${noteName(lo)}–${noteName(hi)}`);
                setStepOk(true);
              }}
            />
          )}
          {step === 'match' && (
            <MatchPage
              onResult={(s: MatchStats) => {
                const ok = matchIsReal(s.tries, s.avgCents, MIN_MATCH_TRIES.measure);
                m.current.matchCents = ok && s.avgCents !== null ? Math.round(s.avgCents) : null;
                m.current.matchLockSec = ok && s.avgLockSec !== null ? Math.round(s.avgLockSec * 10) / 10 : null;
                setStepOk(ok);
                setCaptured(`${s.hits}/${s.tries} صح${s.avgCents !== null ? ` — ${g('بعيدة', 'بعيد')} في المتوسط ±${Math.round(s.avgCents)} سنت` : ''}`);
              }}
            />
          )}
          {step === 'sustain' && <Sustain onResult={(v) => best('sustainSec', v)} />}
          {step === 'stability' && <Stability onResult={(v) => stabilityIsReal(v) && set('stabilityCents', Math.min(m.current.stabilityCents ?? Infinity, v), `أحسن ثبات: ${Math.min(m.current.stabilityCents ?? Infinity, v)} سنت`)} />}
          {step === 'hiss' && <Hiss onResult={(v) => best('hissSec', v)} />}
        </StepFrame>
      </Page>
    );
  }

  if (view.kind === 'measureDone') {
    const fresh = getPath();
    const prevWeek = fresh.weekly.length >= 2 ? fresh.weekly[fresh.weekly.length - 2] : null;
    const vsBase = view.weekly && fresh.baseline ? compareMeasurements(fresh.baseline, view.m) : [];
    const vsLast = view.weekly && prevWeek ? compareMeasurements(prevWeek, view.m) : [];
    return (
      <Page title={view.weekly ? 'نتيجة القياس الأسبوعي' : 'قياس البداية اتحفظ ✔'}>
        {!view.weekly && <p>دي نقطة البداية بتاعتك. كل أسبوع هنقيس تاني ونقارن بيها.</p>}
        <div className="panel">
          <h2>اللي اتقاس</h2>
          <ul className="compare-list">
            {MEASURES.map((x) => {
              const v = measureValue(view.m, x.key);
              return (
                <li key={x.key} className={v === null ? 'missing' : ''}>
                  {x.ar}: {v === null ? 'مش متقاس' : `${x.key === 'matchCents' ? '±' : ''}${Math.round(v * 10) / 10} ${x.unit}`}
                </li>
              );
            })}
          </ul>
          {MEASURES.some((x) => measureValue(view.m, x.key) === null) && <p className="hint">اللي "مش متقاس" مش هيدخل في المقارنة. ممكن تقيسيه المرة الجاية.</p>}
        </div>
        {vsBase.length > 0 && (
          <div className="panel">
            <h2>مقارنة بالبداية</h2>
            <ul className="compare-list">
              {vsBase.map((c, i) => (
                <li key={i} className={c.trend}>
                  {c.ar}
                </li>
              ))}
            </ul>
          </div>
        )}
        {vsLast.length > 0 && (
          <div className="panel">
            <h2>مقارنة بالأسبوع اللي فات</h2>
            <ul className="compare-list">
              {vsLast.map((c, i) => (
                <li key={i} className={c.trend}>
                  {c.ar}
                </li>
              ))}
            </ul>
          </div>
        )}
        <WeeklySongReminder />
        <button className="big" onClick={() => setView({ kind: 'home' })}>
          تمام
        </button>
      </Page>
    );
  }

  // ---- today's workout
  if (view.kind === 'workout') {
    const s = plan[view.step];
    const info = WORKOUT_INFO[s.step];
    return (
      <Page tips mic help="path" title="تمرين النهارده">
        <StepFrame
          key={view.step}
          n={view.step + 1}
          total={plan.length}
          title={s.step === 'maqam' ? `${info.title}: ${maqam.ar}` : info.title}
          how={info.how}
          minutes={s.minutes}
          result={captured}
          ok={stepOk}
          need={WORKOUT_NEED[s.step]}
          onNext={() => nextWorkout(view.step)}
          onSkip={() => nextWorkout(view.step, true)}
        >
          {s.step === 'lesson' && wLesson && (
            <LessonView
              lesson={lessonById(wLesson)!}
              onPassed={() => {
                setCaptured(`الدرس خلص ✔: ${lessonById(wLesson)!.title}`);
                setStepOk(true);
              }}
            />
          )}
          {s.step === 'findnote' && (
            <FindNotePage
              onResult={(n) => {
                setCaptured(`لقيتي ${n} نغمات ✔`);
                setStepOk(n >= 3);
              }}
            />
          )}
          {s.step === 'warmup' && (
            <WarmupPage
              light={light}
              onDone={(parts, c) => {
                setCaptured(`الإحماء: ${parts} من ٣ أجزاء${c === null ? '' : ` (السيرينة: ±${c} سنت)`}`);
                setStepOk(warmupIsReal(parts));
              }}
            />
          )}
          {s.step === 'ear' && (
            <EarPage
              level={currentLevel(getEarHistory())}
              onResult={(r, t) => {
                setCaptured(`${r}/${t} صح — ${EAR_LEVELS.find((l) => l.id === currentLevel(getEarHistory()))!.ar}`);
                setStepOk(earIsReal(t));
              }}
            />
          )}
          {s.step === 'intervals' && (
            <IntervalPage
              level={currentIntervalLevel(getIntervalHistory())}
              onResult={(r, t) => {
                setCaptured(`${r}/${t} صح — المستوى ${INTERVAL_LEVELS[currentIntervalLevel(getIntervalHistory())].n}`);
                setStepOk(intervalsIsReal(r, t));
              }}
            />
          )}
          {s.step === 'rhythm' && (
            <RhythmPage
              onResult={(v) => {
                setCaptured(`الإيقاع: ${v}%`);
                setStepOk(rhythmIsReal(v));
              }}
            />
          )}
          {s.step === 'hiss' && (
            <Hiss
              onResult={(v) => {
                setCaptured(`سسسس ${v} ثانية ✔`);
                setStepOk(secondsIsReal(v));
              }}
            />
          )}
          {s.step === 'match' && (
            <MatchPage
              range={mid}
              onResult={(r) => {
                setCaptured(`${r.hits}/${r.tries} صح`);
                setStepOk(matchIsReal(r.tries, r.avgCents, MIN_MATCH_TRIES.workout));
              }}
            />
          )}
          {s.step === 'sustain' && (
            <Sustain
              note={sustainNote}
              onResult={(v) => {
                setCaptured(`${v} ثانية ✔`);
                setStepOk(secondsIsReal(v));
              }}
            />
          )}
          {s.step === 'maqam' && (
            <MaqamPage
              maqamId={maqamId}
              tonic={middleTonic(range.low, range.high)}
              slow
              onResult={(p) => {
                setCaptured(`${p}% من الدرجات ✔`);
                setStepOk(maqamIsReal(p));
              }}
            />
          )}
        </StepFrame>
      </Page>
    );
  }

  if (view.kind === 'measureEmpty') {
    return (
      <Page title={view.weekly ? 'القياس الأسبوعي' : 'قياس البداية'}>
        <div className="panel center">
          <p>كل الخطوات اتخطت، فمفيش حاجة اتقاست — ومحفظناش قياس فاضي.</p>
          <p className="hint">القياس بيحتاج يسمع صوتك؛ جربي تاني لما يبقى عندك ١٠ دقايق في مكان هادي.</p>
          <button className="big primary" onClick={() => goMeasure(view.weekly)}>
            جربي القياس تاني
          </button>
          <button onClick={() => setView({ kind: 'home' })}>→ رجوع للمسار</button>
        </div>
      </Page>
    );
  }

  if (view.kind === 'workoutNotCounted') {
    return (
      <Page title="تمرين النهارده">
        <div className="panel center">
          <p>
            اتعمل {view.done} من {view.total} خطوات بس، فالتمرين ده مش هيتحسب في 🔥 الأيام ورا بعض.
          </p>
          <p className="hint">ولا يهمك — التمرين بيتحسب لما نص الخطوات على الأقل تتعمل بجد. شوية كل يوم كفاية.</p>
          <button className="big primary" onClick={goWorkout}>
            نجرب تاني
          </button>
          <button onClick={() => setView({ kind: 'home' })}>→ رجوع للمسار</button>
        </div>
      </Page>
    );
  }

  if (view.kind === 'feeling') {
    return (
      <Page title="سؤال سريع">
        <div className="panel center">
          <h2>حسّيتي بأي وجع أو تعب في الزور؟</h2>
          <div className="row">
            {FEELINGS.map((f) => (
              <button key={f.id} className="big" onClick={() => answer(f.id)}>
                {f.ar}
              </button>
            ))}
          </div>
        </div>
      </Page>
    );
  }

  if (view.kind === 'feelingDone') {
    return (
      <Page title="خلصتي تمرين النهارده 🎉">
        {view.feeling === 'yes' && (
          <div className="error">
            <b>وقفي التمرين دلوقتي وريّحي صوتك.</b> متغنيش ومتزعقيش النهارده، واشربي مية دافية. لو البحة أو الوجع فضلوا أكتر من يومين، روحي لدكتور (أنف وأذن وحنجرة).
          </div>
        )}
        {view.feeling === 'little' && <div className="notes">بكرة هنعمل تمرين أخف وأقصر. ريّحي صوتك النهارده واشربي مية.</div>}
        {view.feeling === 'no' && <p className="ok-text">برافو! كده تمام. نتقابل بكرة 👋</p>}
        <button className="big" onClick={() => setView({ kind: 'home' })}>
          تمام
        </button>
      </Page>
    );
  }

  // ---- path home
  const days = streak(
    real.map((w) => w.date),
    day,
  );
  return (
    <Page tips help="path" title="مسار المبتدئ" intro="كل يوم تمرين صغير (٧–١٠ دقايق)، وكل أسبوع قياس نشوف بيه إنتي اتحسنتي قد إيه.">
      <div className="stats">
        <Stat label="أيام ورا بعض" value={`🔥 ${days}`} />
        <Stat label="تمارين خلصت" value={workoutsDone} />
        <Stat label="مقام النهارده" value={maqam.ar} />
      </div>

      {restWarning && (
        <div className="error">
          آخر مرة حسّيتي بوجع في الزور. <b>الأحسن تسيبي تمرين النهارده وتريّحي صوتك.</b> لو مفيش وجع خالص دلوقتي، اعملي التمرين الخفيف بس. ولو البحة كملت أكتر من يومين روحي لدكتور.
        </div>
      )}
      {light && !restWarning && <div className="notes">امبارح كان في شوية تعب، فالنهارده تمرين أخف (حوالي ٦ دقايق).</div>}

      {status.kind === 'baseline' ? (
        <div className="panel center">
          <h2>أول خطوة: قياس البداية</h2>
          <p>حوالي ١٠ دقايق: المساحة، مطابقة النغمة، النفس، الثبات، والسسسس. بنحفظه عشان نقارن بيه كل أسبوع.</p>
          <button className="big primary" onClick={() => goMeasure(false)}>
            ابدئي قياس البداية
          </button>
        </div>
      ) : (
        <>
          {status.kind === 'due' && (
            <div className="panel center">
              <h2>وقت القياس الأسبوعي 📏</h2>
              <p>عدّى أسبوع! نقيس تاني ونشوف الفرق.</p>
              <button className="big primary" onClick={() => goMeasure(true)}>
                ابدئي القياس الأسبوعي
              </button>
            </div>
          )}
          <div className="panel center">
            <h2>{doneToday ? 'خلّصتي تمرين النهارده ✔' : 'تمرين النهارده'}</h2>
            <p className="hint">
              {plan.map((p) => WORKOUT_INFO[p.step].title.split(' —')[0].split(':')[0]).join(' ← ')} · حوالي {minutesAr(plan.reduce((a, p) => a + p.minutes, 0))}
            </p>
            <p className="hint">
              النغمات من نص صوتك: <span dir="ltr">{noteName(mid.low)}–{noteName(mid.high)}</span>
            </p>
            <button className={doneToday ? 'big' : 'big primary'} onClick={goWorkout}>
              {doneToday ? 'عيدي التمرين' : 'كمّلي تمرين النهارده'}
            </button>
            {status.kind === 'later' && <p className="hint">القياس الأسبوعي الجاي بعد {status.inDays} {status.inDays === 1 ? 'يوم' : 'أيام'}.</p>}
          </div>
        </>
      )}

      {data.baseline && (
        <div className="panel">
          <p className="hint">قياس البداية: {data.baseline.date}</p>
          <button className="link" onClick={() => setConfirmRedo(true)}>
            🔁 إعادة قياس البداية
          </button>
          {confirmRedo && (
            <div className="confirm-box" role="alertdialog" aria-label="تأكيد إعادة قياس البداية">
              <p>قياس البداية الجديد هيحل مكان القديم (والمقارنات الأسبوعية هتبقى بالجديد). النتايج التانية مش هتتمسح.</p>
              <div className="row">
                <button className="primary" onClick={() => goMeasure(false)}>
                  أيوه، نقيس من الأول
                </button>
                <button onClick={() => setConfirmRedo(false)}>لأ</button>
              </div>
            </div>
          )}
        </div>
      )}

      <BeginnerGuide />
    </Page>
  );
}

/** Streak and next step, for the home screen card. */
export function pathSummary(): { streak: number; next: string; started: boolean } {
  const p = usableMeasurements(getPath());
  const real = countedWorkouts(p.workouts, new Set(getResults().map((x) => x.date)));
  const day = today();
  const last = p.weekly.length ? p.weekly[p.weekly.length - 1].date : (p.baseline?.date ?? null);
  const status = weeklyStatus(last, day);
  const days = streak(
    real.map((w) => w.date),
    day,
  );
  const next =
    status.kind === 'baseline'
      ? 'ابدئي بقياس البداية'
      : status.kind === 'due'
        ? 'وقت القياس الأسبوعي 📏'
        : real.some((w) => w.date === day)
          ? 'خلّصتي تمرين النهارده ✔'
          : 'كمّلي تمرين النهارده';
  return { streak: days, next, started: !!p.baseline };
}

/** "Record the same song every week": points to the library and the chosen weekly song. */
function WeeklySongReminder() {
  const id = getWeeklySong();
  const song = id ? getSongs().find((x) => x.id === id) : undefined;
  return (
    <div className="notes">
      🎙️ سجّلي نفسك وانتي بتغني <b>نفس الأغنية</b> كل أسبوع واحفظي التسجيل على جهازك. بعد شهر اسمعي أول تسجيل وآخر تسجيل ورا بعض — هتسمعي الفرق بودنك.
      <div className="row" style={{ justifyContent: 'flex-start', marginTop: 8 }}>
        {song && (song.file || song.youtube) ? (
          <button className="primary" onClick={() => singSong(song)}>
            ⭐ غني أغنية الأسبوع: {song.title}
          </button>
        ) : song ? (
          <a href={`#/songs/${song.id}`}>⭐ أغنية الأسبوع: {song.title} (ضيفي لها لينك أو ملف)</a>
        ) : (
          <a href="#/songs">📚 اختاري أغنية الأسبوع من المكتبة (⭐ في صفحة الأغنية)</a>
        )}
      </div>
    </div>
  );
}
