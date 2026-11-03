import { useEffect, useState } from 'react';
import { RangePage } from './pages/RangePage';
import { MatchPage } from './pages/MatchPage';
import { MaqamPage } from './pages/MaqamPage';
import { BreathPage } from './pages/BreathPage';
import { SingAlongPage } from './pages/SingAlongPage';
import { ProgressPage } from './pages/ProgressPage';
import { TeacherPage } from './pages/TeacherPage';
import { KeyPage } from './pages/KeyPage';
import { PathPage } from './pages/PathPage';
import { ExercisesPage } from './pages/ExercisesPage';
import { CarPage } from './pages/CarPage';
import { FindNotePage } from './pages/FindNotePage';
import { VocalisePage } from './pages/VocalisePage';
import { WarmupPage } from './pages/WarmupPage';
import { EarPage } from './pages/EarPage';
import { IntervalPage } from './pages/IntervalPage';
import { LibraryPage } from './pages/LibraryPage';
import { GuidePage } from './pages/GuidePage';
import { LessonsPage } from './pages/LessonsPage';
import { RhythmPage } from './pages/RhythmPage';
import { GamePage } from './pages/GamePage';
import { DynamicsPage } from './pages/DynamicsPage';
import { PianoPage } from './pages/PianoPage';
import { BadgesPage, Celebration } from './pages/BadgesPage';
import { shouldShowWelcome, Welcome } from './components/Welcome';
import { HomePage } from './pages/HomePage';
import { MorePage } from './pages/MorePage';
import { Icon } from './components/Icons';
import { applyTheme } from './lib/theme';
import { lifecycle } from './lib/lifecycle';
import { onSoundFallback } from './audio/sound';
import { SYNC_APPLIED_EVENT } from './sync/account';
import { AccountPage } from './pages/AccountPage';
import { ErrorBoundary } from './components/ErrorBoundary';
import { backOf, TABS, tabOf } from './lib/nav';
import { genderChosen } from './lib/gender';
import { useOnline, useUpdateWaiting } from './audio/offline';

// To add a page: add a row here and a component in src/pages, and a card on the "التمارين" page (or a row on "المزيد").
// `desc`/`home` are kept for reference; navigation is the bottom tab bar + the top bar's back button.
const PAGES = [
  { id: 'path', icon: '🌱', title: 'مسار المبتدئ', desc: 'التطبيق يقولك تعملي إيه كل يوم ويوريكي بتتحسني ولا لأ', el: PathPage, home: false },
  { id: 'lessons', icon: '🎓', title: 'أساسيات الموسيقى', desc: 'دروس صغيرة: النغمة، دو ري مي، الأوكتاف، الربع تون، يعني إيه مقام', el: LessonsPage, home: true },
  { id: 'exercises', icon: '🏋️', title: 'التمارين', desc: 'كل التمارين متقسمة: إحماء، نفس، طبقات، نغمة، ودن، فواصل، مقامات، أغاني', el: ExercisesPage, home: true },
  { id: 'songs', icon: '📚', title: 'مكتبة أغانيّ', desc: 'أغانيكي، ومنها تتعلمي أغنية جملة جملة', el: LibraryPage, home: true },
  { id: 'car', icon: '🚗', title: 'وضع العربية', desc: 'جلسة بالصوت بس، من غير ما تبصي على الموبايل', el: CarPage, home: true },
  { id: 'guide', icon: '📖', title: 'دليل الاستخدام', desc: 'إزاي تستخدمي كل خاصية، وتبدئي منين', el: GuidePage, home: true },
  { id: 'badges', icon: '🏆', title: 'الأوسمة والتحدي', desc: 'تحدي صغير كل يوم، وأوسمة من نتايجك', el: BadgesPage, home: true },
  { id: 'progress', icon: '📈', title: 'التقدم', desc: 'نتايجك يوم بيوم، ونسخة بياناتك', el: ProgressPage, home: true },
  { id: 'teacher', icon: '🎙️', title: 'تسجيل صوت المعلم', desc: 'نغمات و"دو ري مي" بصوت حقيقي بدل البيانو', el: TeacherPage, home: true },
  { id: 'warmup', icon: '🌿', title: 'الإحماء', desc: '', el: WarmupPage, home: false },
  { id: 'findnote', icon: '🪜', title: 'إزاي أجيب دو صح؟', desc: '', el: FindNotePage, home: false },
  { id: 'vocalise', icon: '🎶', title: 'تمارين الصوت', desc: '', el: VocalisePage, home: false },
  { id: 'ear', icon: '👂', title: 'تدريب الودن', desc: '', el: EarPage, home: false },
  { id: 'intervals', icon: '🪜', title: 'غنا الفواصل', desc: '', el: IntervalPage, home: false },
  { id: 'range', icon: '📏', title: 'اختبار المساحة الصوتية', desc: '', el: RangePage, home: false },
  { id: 'piano', icon: '🎹', title: 'البيانو', desc: '', el: PianoPage, home: false },
  { id: 'match', icon: '🎯', title: 'مطابقة النغمة', desc: '', el: MatchPage, home: false },
  { id: 'maqam', icon: '🎼', title: 'المقامات', desc: '', el: MaqamPage, home: false },
  { id: 'breath', icon: '🌬️', title: 'النفس', desc: '', el: BreathPage, home: false },
  { id: 'sing', icon: '🎵', title: 'غني مع الأغنية', desc: '', el: SingAlongPage, home: false },
  { id: 'key', icon: '🔎', title: 'اكتشف المقام', desc: '', el: KeyPage, home: false },
  { id: 'rhythm', icon: '🥁', title: 'الإيقاع', desc: '', el: RhythmPage, home: false },
  { id: 'dynamics', icon: '🎚️', title: 'العالي والواطي', desc: '', el: DynamicsPage, home: false },
  { id: 'game', icon: '🎮', title: 'لعبة الصوت', desc: '', el: GamePage, home: false },
  { id: 'more', icon: '⚙️', title: 'المزيد', desc: '', el: MorePage, home: false },
  { id: 'account', icon: '👤', title: 'حسابي', desc: '', el: AccountPage, home: false },
];

function titleOf(route: string): string {
  if (route === '') return 'الرئيسية';
  if (/^songs\/[^/]+$/.test(route)) return 'المكتبة';
  if (route.startsWith('songs/')) return 'الأغنية';
  return PAGES.find((p) => p.id === route.split('/')[0])?.title ?? TABS.find((t) => t.id === route)?.ar ?? 'رجوع';
}

function currentPage() {
  return window.location.hash.replace(/^#\/?/, '');
}

export default function App() {
  const [page, setPage] = useState(currentPage);
  const [welcome, setWelcome] = useState(shouldShowWelcome);
  const [askGender, setAskGender] = useState(() => !genderChosen());
  // bumped when she comes back to the app while something was playing/listening: the page starts fresh
  const [epoch, setEpoch] = useState(0);
  const [stopped, setStopped] = useState(false);

  // data that arrived from the other device: apply the settings, and show it (unless an exercise is running)
  useEffect(() => {
    const onSync = (e: Event) => {
      const keys = (e as CustomEvent<string[]>).detail ?? [];
      if (keys.includes('soty.pref.theme')) applyTheme();
      // not during an exercise, and not while she's typing in a form (a remount would lose what she wrote)
      const typing = document.activeElement?.matches('input, textarea, select');
      if (lifecycle.isBusy() || typing) return;
      if (keys.includes('soty.pref.gender')) return window.location.reload(); // the wording switches on a fresh page
      setEpoch((x) => x + 1);
    };
    window.addEventListener(SYNC_APPLIED_EVENT, onSync);
    return () => window.removeEventListener(SYNC_APPLIED_EVENT, onSync);
  }, []);

  useEffect(
    () =>
      lifecycle.onVisible(({ wasBusy }) => {
        if (!wasBusy) return;
        setEpoch((e) => e + 1);
        setStopped(true);
      }),
    [],
  );

  useEffect(() => {
    applyTheme();
    const onHash = () => {
      setPage(currentPage());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const active = PAGES.find((p) => p.id === page.split('/')[0]);
  const back = backOf(page);
  const tab = tabOf(page);

  if (welcome)
    return (
      <>
        <Welcome
          onDone={() => {
            setWelcome(false);
            setAskGender(!genderChosen());
          }}
        />
        <Toasts />
      </>
    );

  return (
    <div className="app">
      <header className="topbar">
        {back !== null ? (
          <a className="back" href={`#/${back}`}>
            <Icon name="back" size={22} />
            {titleOf(back)}
          </a>
        ) : (
          <span className="logo">صوتي</span>
        )}
        <a className={'icon-btn' + (tab === 'more' ? ' on' : '')} href="#/more" aria-label="المزيد: الإعدادات والبيانات والدليل">
          <Icon name="more" />
        </a>
      </header>
      <main>
        <ErrorBoundary key={`${page}-${epoch}`}>{active ? <active.el key={`${active.id}-${epoch}`} /> : <HomePage askGender={askGender} onGenderDone={() => setAskGender(false)} />}</ErrorBoundary>
      </main>
      <nav className="tabbar" aria-label="الأقسام">
        {TABS.map((t) => (
          <a key={t.id || 'home'} className={'tab' + (t.id === tab ? ' on' : '')} href={`#/${t.id}`} aria-current={t.id === tab ? 'page' : undefined}>
            <Icon name={t.icon} />
            <span>{t.ar}</span>
          </a>
        ))}
      </nav>
      <Toasts stopped={stopped} onCloseStopped={() => setStopped(false)} />
    </div>
  );
}

/** Messages that float above the tab bar: update ready, offline, a new badge. */
function Toasts({ stopped = false, onCloseStopped }: { stopped?: boolean; onCloseStopped?: () => void }) {
  const [fallback, setFallback] = useState(false);
  const [killed, setKilled] = useState(() => !!window.__sotyKilled);
  useEffect(() => onSoundFallback(() => setFallback(true)), []);
  // the "we stopped" note goes away by itself
  useEffect(() => {
    if (!stopped) return;
    const t = setTimeout(() => onCloseStopped?.(), 7000);
    return () => clearTimeout(t);
  }, [stopped]);
  return (
    <div className="toasts" aria-live="polite">
      <UpdateBanner />
      {stopped && (
        <div className="toast" role="status">
          <span>رجعتي 👋 وقفنا اللي كان شغال لما خرجتي من التطبيق — دوسي ابدئي تاني.</span>
          <button className="link" onClick={onCloseStopped} aria-label="إخفاء">
            ✕
          </button>
        </div>
      )}
      {killed && (
        <div className="toast" role="status">
          <span>التطبيق اتقفل فجأة المرة اللي فاتت. رجعناكي لمكانك، ونتايجك محفوظة.</span>
          <button className="link" onClick={() => setKilled(false)} aria-label="إخفاء">
            ✕
          </button>
        </div>
      )}
      {fallback && (
        <div className="toast offline-banner" role="status">
          <span>أصوات البيانو متحمّلتش — بنعزف صوت بسيط بداله لحد ما تتحمّل.</span>
          <button className="link" onClick={() => setFallback(false)} aria-label="إخفاء">
            ✕
          </button>
        </div>
      )}
      <Celebration />
    </div>
  );
}

/** "فيه نسخة جديدة — حدّثي" after a new deploy, and a note when there's no internet. */
function UpdateBanner() {
  const { waiting, update } = useUpdateWaiting();
  const online = useOnline();
  return (
    <>
      {waiting && (
        <div className="toast update-banner" role="status">
          <span>فيه نسخة جديدة من التطبيق.</span>
          <button className="primary" onClick={update}>
            حدّثي
          </button>
        </div>
      )}
      {!online && <div className="toast offline-banner">📴 مفيش إنترنت — التطبيق شغال عادي، بس يوتيوب ولينكات الفيديو محتاجة إنترنت.</div>}
    </>
  );
}
