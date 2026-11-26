import { GenderCard } from '../components/GenderChoice';
import { CourseCard } from '../components/CourseCard';
import { minutesAr, pathSummary } from './PathPage';
import { lessonById, todaysLesson } from '../content/lessons';
import { readCount } from '../lib/lessonProgress';
import { getLessonProgress, getLessonsDone, today } from '../lib/storage';
import { arDigits } from '../components/ActivityBadge';
import { g } from '../lib/gender';

const TILES = [
  { href: '#/lessons', icon: '🎓', title: 'الدروس' },
  { href: '#/exercises', icon: '🏋️', title: 'التمارين' },
  { href: '#/songs', icon: '📚', title: 'أغانيّ' },
];

/**
 * Home: ONE big button that always does the right next thing (today's workout; once it's done, more of the course),
 * named after what she'll do. Measurements are never the main button: a small card under it. Then her course card,
 * the streak, and the three ways in. An optional lesson is a small secondary link.
 */
export function HomePage({ askGender, onGenderDone }: { askGender: boolean; onGenderDone: () => void }) {
  const { streak, doneToday, minutes, weeklyDue, baselineMissing } = pathSummary();
  const lessonId = todaysLesson(getLessonsDone(), today());
  const lesson = lessonId ? lessonById(lessonId)! : null;
  const lessonHref = lesson ? `#/lessons/${lesson.id}${readCount(getLessonProgress(), lesson.id) ? '/resume' : ''}` : '';
  return (
    <section className="page home">
      {askGender && <GenderCard onDone={onGenderDone} />}
      <h1 className="greeting">أهلاً 👋</h1>
      {doneToday ? (
        <>
          <p className="ok-text home-line">✔ خلّصتي تمرين النهارده — برافو!</p>
          <a className="button-link big-link secondary" href="#/course">
            كمّلي في كورس الصوت
          </a>
        </>
      ) : (
        <a className="button-link big-link" href="#/path/today">
          ابدئي تمرين النهارده — {minutesAr(minutes)}
        </a>
      )}
      {streak > 0 && (
        <p className="hint home-line">
          🔥 {arDigits(streak)} {streak === 1 ? 'يوم' : 'أيام'} ورا بعض
        </p>
      )}
      {weeklyDue && (
        <a className="home-card" href="#/path/weekly">
          📏 وقت القياس الأسبوعي — حوالي ١٠ دقايق
          <span className="hint">بنقيس صوتك ونقارنه بالأسبوع اللي فات.</span>
        </a>
      )}
      {baselineMissing && (
        <a className="home-card" href="#/path/start">
          📏 قياس البداية — حوالي ١٠ دقايق
          <span className="hint">مرة واحدة، عشان كل أسبوع تشوفي صوتك اتحسن قد إيه.</span>
        </a>
      )}
      <CourseCard />
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
      {lesson && (
        <a className="home-minor" href={lessonHref}>
          درس قصير {g('لو حابة', 'لو حابب')}: {lesson.title}
        </a>
      )}
    </section>
  );
}
