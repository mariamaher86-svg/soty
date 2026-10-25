import { useEffect, useState } from 'react';
import { Page } from '../components/ui';
import { LESSONS } from '../content/lessons';
import { BADGES, challengeDone, challengeLevel, dailyChallenge, earnedBadges, newBadges, type BadgeContext, type Challenge } from '../lib/badges';
import { getLessonsDone, getPref, getRange, getResults, getSongs, RESULT_EVENT, setPref, today } from '../lib/storage';
import { getPhraseProgress, PHRASE_GOOD } from './LearnSongPage';

const readList = (key: string): string[] => {
  try {
    const v = JSON.parse(getPref(key) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
};

function badgeContext(): BadgeContext {
  return {
    results: getResults(),
    range: getRange(),
    lessonsDone: getLessonsDone(),
    lessonCount: LESSONS.length,
    phraseProgress: getSongs()
      .map((s) => getPhraseProgress(s.id))
      .filter((p) => !!p)
      .map((p) => ({ phrases: p!.phrases.length, best: p!.phrases.map((_, i) => p!.best[i] ?? 0) })),
    challengeDays: readList('challenge.days'),
    phraseGood: PHRASE_GOOD,
  };
}

export function todaysChallenge(): { c: Challenge; done: boolean } {
  const results = getResults();
  const c = dailyChallenge(today(), challengeLevel(results, Object.keys(getLessonsDone()).length, LESSONS.length));
  return { c, done: challengeDone(c, results, today()) };
}

/** Records today's challenge when done; returns what's new to celebrate. */
function checkNew(): { badges: string[]; challenge: boolean } {
  const { done } = todaysChallenge();
  const days = readList('challenge.days');
  let challenge = false;
  if (done && !days.includes(today())) {
    setPref('challenge.days', JSON.stringify([...days, today()].slice(-400)));
    challenge = true;
  }
  const earned = earnedBadges(badgeContext());
  const seen = readList('badges.seen');
  const fresh = newBadges(earned, seen);
  if (fresh.length) setPref('badges.seen', JSON.stringify([...seen, ...fresh]));
  return { badges: fresh, challenge };
}

/** A small celebration when a badge is earned or today's challenge is done (anywhere in the app). */
export function Celebration() {
  const [news, setNews] = useState<{ badges: string[]; challenge: boolean } | null>(null);
  useEffect(() => {
    const check = () => {
      const n = checkNew();
      if (n.badges.length || n.challenge) setNews((old) => ({ badges: [...(old?.badges ?? []), ...n.badges], challenge: !!old?.challenge || n.challenge }));
    };
    check();
    window.addEventListener(RESULT_EVENT, check);
    return () => window.removeEventListener(RESULT_EVENT, check);
  }, []);
  if (!news) return null;
  const list = news.badges.map((id) => BADGES.find((b) => b.id === id)!).filter(Boolean);
  return (
    <div className="toast celebration" role="status">
      <span className="celebration-burst" aria-hidden>
        🎉
      </span>
      <span>
        {news.challenge && <b>✔ خلّصتي تحدي النهارده! </b>}
        {list.length === 1 && (
          <>
            وسام جديد: {list[0].icon} <b>{list[0].ar}</b>
          </>
        )}
        {list.length > 1 && <>{list.length} أوسمة جديدة: {list.map((b) => b.icon).join(' ')}</>}
      </span>
      <a href="#/badges" onClick={() => setNews(null)}>
        الأوسمة
      </a>
      <button className="link" onClick={() => setNews(null)} aria-label="إخفاء">
        ✕
      </button>
    </div>
  );
}

export function ChallengeCard() {
  const { c, done } = todaysChallenge();
  return (
    <div className={'panel challenge' + (done ? ' done' : '')}>
      <h2>⭐ تحدي النهارده</h2>
      <p className="challenge-text">{c.ar}</p>
      {done ? (
        <p className="ok-text">✔ خلصتيه — برافو!</p>
      ) : (
        <a className="button-link primary" href={c.href}>
          يلا ←
        </a>
      )}
      <p className="hint">بيتعلّم لوحده أول ما نتيجة النهارده توصل للهدف.</p>
    </div>
  );
}

export function BadgesPage() {
  const [ctx, setCtx] = useState(badgeContext);
  useEffect(() => {
    const f = () => setCtx(badgeContext());
    window.addEventListener(RESULT_EVENT, f);
    return () => window.removeEventListener(RESULT_EVENT, f);
  }, []);
  const earned = new Set(earnedBadges(ctx));
  return (
    <Page help="badges" title="🏆 الأوسمة والتحدي" intro="تحدي صغير كل يوم على قد مستواكي، وأوسمة بتيجي لوحدها من نتايجك.">
      <ChallengeCard />
      <p className="hint">
        التحديات اللي خلصتيها: {new Set(ctx.challengeDays).size} · الأوسمة: {earned.size} من {BADGES.length}
      </p>
      <div className="badges">
        {BADGES.map((b) => (
          <div key={b.id} className={'badge' + (earned.has(b.id) ? ' on' : '')}>
            <span className="badge-icon" aria-hidden>
              {earned.has(b.id) ? b.icon : '🔒'}
            </span>
            <b>{b.ar}</b>
            <small className="hint">{earned.has(b.id) ? '✔' : b.how}</small>
          </div>
        ))}
      </div>
    </Page>
  );
}
