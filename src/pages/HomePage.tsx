import { GenderCard } from '../components/GenderChoice';
import { g } from '../lib/gender';
import { pathSummary } from './PathPage';
import { lessonById, todaysLesson } from '../content/lessons';
import { readCount } from '../lib/lessonProgress';
import { getLessonProgress, getLessonsDone, today } from '../lib/storage';

const TILES = [
  { href: '#/lessons', icon: '🎓', title: 'الدروس' },
  { href: '#/exercises', icon: '🏋️', title: 'التمارين' },
  { href: '#/songs', icon: '📚', title: 'أغانيّ' },
];

/** Home: a greeting, one big button for today, the streak in one line, and three ways in. Everything else is inside. */
export function HomePage({ askGender, onGenderDone }: { askGender: boolean; onGenderDone: () => void }) {
  const { streak, next, started } = pathSummary();
  const doneToday = next.includes('✔');
  const weekly = next.includes('الأسبوعي');
  // lessons are their own habit: one optional line, never part of the workout
  const lessonId = todaysLesson(getLessonsDone(), today());
  const lesson = lessonId ? lessonById(lessonId)! : null;
  const lessonHref = lesson ? `#/lessons/${lesson.id}${readCount(getLessonProgress(), lesson.id) ? '/resume' : ''}` : '';
  return (
    <section className="page home">
      {askGender && <GenderCard onDone={onGenderDone} />}
      <h1 className="greeting">أهلاً 👋</h1>
      {!started ? (
        <>
          <a className="button-link big-link" href="#/path/start">
            نبدأ من هنا
          </a>
          <p className="hint home-line">قياس صغير لصوتك (حوالي ١٠ دقايق)، وبعده التطبيق يقولك {g('تتمرني', 'تتمرن')} على إيه كل يوم.</p>
        </>
      ) : (
        <>
          <a className={'button-link big-link' + (doneToday ? ' secondary' : '')} href="#/path">
            {doneToday ? 'خلّصتي تمرين النهارده ✔' : weekly ? 'ابدئي القياس الأسبوعي' : 'ابدئي تمرين النهارده'}
          </a>
          <p className="hint home-line">
            {streak} {streak === 1 ? 'يوم' : 'أيام'} ورا بعض
          </p>
        </>
      )}
      {lesson && (
        <a className="home-lesson" href={lessonHref}>
          درس النهارده (اختياري): {lesson.title}
        </a>
      )}
      <nav className="tiles" aria-label="ادخلي على">
        {TILES.map((t) => (
          <a key={t.href} className="tile" href={t.href}>
            <span className="tile-icon" aria-hidden>
              {t.icon}
            </span>
            <span className="tile-title">{t.title}</span>
          </a>
        ))}
      </nav>
    </section>
  );
}
