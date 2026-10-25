import { useState } from 'react';
import { Page } from '../components/ui';
import { GenderButtons } from '../components/GenderChoice';
import { BackupSection, NoiseSetting } from '../components/BackupSection';
import { getTheme, setTheme, type Theme } from '../lib/theme';

const THEMES: { id: Theme; ar: string }[] = [
  { id: '', ar: 'زي الموبايل' },
  { id: 'light', ar: 'فاتح' },
  { id: 'dark', ar: 'غامق' },
];

const LINKS = [
  { href: '#/badges', icon: '🏆', ar: 'الأوسمة والتحدي' },
  { href: '#/guide', icon: '📖', ar: 'دليل الاستخدام' },
  { href: '#/teacher', icon: '🎙️', ar: 'تسجيل صوت المعلم' },
];

/** "⚙️ المزيد": settings, data backup, and the pages that aren't exercises. */
export function MorePage() {
  const [theme, setThemeState] = useState<Theme>(getTheme);
  return (
    <Page title="المزيد">
      <nav className="list" aria-label="صفحات تانية">
        {LINKS.map((l) => (
          <a key={l.href} className="list-row" href={l.href}>
            <span className="row-icon" aria-hidden>
              {l.icon}
            </span>
            <span className="row-text row-main">{l.ar}</span>
            <span className="chev" aria-hidden>
              ‹
            </span>
          </a>
        ))}
      </nav>

      <div className="panel">
        <h2>الإعدادات</h2>
        <div className="setting">
          <b>نكلمك إزاي؟</b>
          <GenderButtons />
        </div>
        <div className="setting">
          <b>الألوان</b>
          <div className="choices" role="group" aria-label="الألوان">
            {THEMES.map((t) => (
              <button
                key={t.id || 'auto'}
                className={t.id === theme ? 'chip active' : 'chip'}
                onClick={() => {
                  setTheme(t.id);
                  setThemeState(t.id);
                }}
              >
                {t.ar}
              </button>
            ))}
          </div>
        </div>
        <NoiseSetting />
      </div>

      <BackupSection />
    </Page>
  );
}
