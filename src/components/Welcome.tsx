// First-run welcome: 3–4 short screens, skippable, shown once when the app has no data yet.
// Wording is for anyone (impersonal / "we" form).

import { useRef, useState } from 'react';
import { getPath, getPref, getRange, getResults, getSongs, setPref } from '../lib/storage';
import { GenderButtons } from './GenderChoice';
import { genderChosen } from '../lib/gender';
import { isEmptyMeasurement } from '../lib/path';

const KEY = 'welcome.done';

/** Show it on the very first open (no data at all), or again after "عرض الترحيب تاني". */
export function shouldShowWelcome(): boolean {
  const v = getPref(KEY);
  if (v === 'again') return true;
  if (v === '1') return false;
  const p = getPath();
  return isEmptyMeasurement(p.baseline) && !getResults().length && !getSongs().length && !getRange();
}

export function showWelcomeAgain() {
  setPref(KEY, 'again');
}

const SCREENS: { icon: string; title: string; lines: string[]; gender?: boolean }[] = [
  {
    icon: '🎤',
    title: 'أهلاً في صوتي',
    lines: ['تطبيق لتدريب الصوت على الغنا: النغمة المظبوطة، النفس، المساحة الصوتية، والمقامات العربي.', 'معمول لأي حد لسه بيبتدي — مش لازم خبرة أو دراسة موسيقى قبل كده.'],
  },
  {
    icon: '🎧',
    title: 'المطلوب',
    lines: ['موبايل وسماعات (يفضل بسلك)، ومكان هادي.', 'على الآيفون: الوضع الصامت مقفول والصوت عالي — التفاصيل في كارت «📱 قبل ما تبدأي».'],
  },
  {
    icon: '👋',
    title: 'نكلمك إزاي؟',
    lines: ['ده بيغيّر طريقة الكلام، وكمان النغمات الافتراضية وطبقات الصوت (صوت البنات والستات غير صوت الولاد والرجالة). ممكن تغييره بعدين من ⚙️ المزيد.'],
    gender: true,
  },
  {
    icon: '🗓️',
    title: 'الخطة',
    lines: ['أول يوم: قياس البداية (حوالي ١٠ دقايق) عشان نعرف نقطة البداية.', 'كل يوم: تمرين النهارده، حوالي ١٠–١٣ دقيقة، والتطبيق بيمشّي خطوة خطوة.', 'كل أسبوع: القياس الأسبوعي، وتسجيل نفس الأغنية للمقارنة بالودن.'],
  },
];

export function Welcome({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const touchX = useRef<number | null>(null);
  const last = i === SCREENS.length; // the final "start" screen

  const finish = (go: string) => {
    setPref(KEY, '1');
    window.location.hash = go;
    onDone();
  };
  const next = () => setI((x) => Math.min(SCREENS.length, x + 1));
  const back = () => setI((x) => Math.max(0, x - 1));

  return (
    <div
      className="welcome"
      role="dialog"
      aria-label="ترحيب"
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        touchX.current = null;
        // right-to-left reading: swiping towards the right shows the next screen
        if (dx > 50) next();
        else if (dx < -50) back();
      }}
    >
      <div className="welcome-card">
        {!last ? (
          <>
            <div className="welcome-icon">{SCREENS[i].icon}</div>
            <h1>{SCREENS[i].title}</h1>
            {SCREENS[i].lines.map((l) => (
              <p key={l}>{l}</p>
            ))}
            {SCREENS[i].gender && <GenderButtons reload={false} onChosen={() => setTimeout(next, 150)} />}
            <div className="row">
              {i > 0 && <button onClick={back}>→ رجوع</button>}
              <button className="big primary" disabled={SCREENS[i].gender && !genderChosen()} onClick={next}>
                التالي ←
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="welcome-icon">🌱</div>
            <h1>جاهزين؟</h1>
            <p>أول خطوة: قياس البداية. بعده التطبيق بيقول بالظبط إيه تمرين كل يوم.</p>
            <button className="big primary" onClick={() => finish('#/path/start')}>
              🌱 نبدأ من هنا
            </button>
            <button onClick={() => finish('#/')}>هتفرّج الأول</button>
          </>
        )}
        <div className="dots" aria-hidden>
          {[...SCREENS, null].map((_, k) => (
            <span key={k} className={k === i ? 'on' : ''} />
          ))}
        </div>
        {!last && (
          <button className="link" onClick={() => finish('#/')}>
            تخطي الترحيب
          </button>
        )}
      </div>
    </div>
  );
}
