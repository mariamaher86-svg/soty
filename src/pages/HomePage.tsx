import { GenderCard } from '../components/GenderChoice';
import { g } from '../lib/gender';
import { pathSummary } from './PathPage';
import { todaysChallenge } from './BadgesPage';

/** Home = what matters today: the beginner-path card with one big button, the daily challenge, the streak. */
export function HomePage({ askGender, onGenderDone }: { askGender: boolean; onGenderDone: () => void }) {
  const { streak, next, started } = pathSummary();
  const { c, done } = todaysChallenge();
  const doneToday = next.includes('✔');
  return (
    <section className="page home">
      {askGender && <GenderCard onDone={onGenderDone} />}
      {!started ? (
        <div className="panel hero">
          <h1>أهلاً 👋</h1>
          <p>أول خطوة: قياس صغير لصوتك (حوالي ١٠ دقايق). بعده التطبيق بيقولك {g('تتمرني', 'تتمرن')} على إيه كل يوم.</p>
          <a className="button-link big-link" href="#/path/start">
            ابدئي قياس البداية
          </a>
        </div>
      ) : (
        <div className="panel hero">
          <p className="hero-kicker">مسار المبتدئ</p>
          <h1>{doneToday ? 'خلّصتي تمرين النهارده ✔' : 'تمرين النهارده'}</h1>
          <p className="streak">
            🔥 {streak} {streak === 1 ? 'يوم' : 'أيام'} ورا بعض
          </p>
          {!doneToday && next !== 'كمّلي تمرين النهارده' && <p className="hint">{next}</p>}
          <a className={'button-link big-link' + (doneToday ? ' secondary' : '')} href="#/path">
            {doneToday ? 'افتحي المسار' : 'ابدئي تمرين النهارده'}
          </a>
        </div>
      )}
      <a className={'list-row challenge-row' + (done ? ' done' : '')} href={done ? '#/badges' : c.href}>
        <span>
          <span className="row-label">تحدي النهارده</span>
          <span className="row-main">{c.ar}</span>
        </span>
        <span className="chev" aria-hidden>
          {done ? '✔' : '‹'}
        </span>
      </a>
      <a className="list-row" href="#/exercises">
        <span>
          <span className="row-label">{g('عايزة حاجة تانية؟', 'عايز حاجة تانية؟')}</span>
          <span className="row-main">كل التمارين</span>
        </span>
        <span className="chev" aria-hidden>
          ‹
        </span>
      </a>
    </section>
  );
}
