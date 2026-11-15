import { Page } from '../components/ui';

interface Item {
  href: string;
  icon: string;
  name: string;
  what: string;
}

/** A few big groups; each opens a short list (#/exercises/<group>). One title, one short line and one icon per card. */
export const GROUPS: { id: string; icon: string; title: string; what: string; items: Item[] }[] = [
  {
    id: 'start',
    icon: '🌱',
    title: 'ابدئي من هنا',
    what: 'المسار اليومي والدروس',
    items: [
      { href: '#/path', icon: '🌱', name: 'مسار المبتدئ', what: 'تمرين كل يوم وقياس كل أسبوع' },
      { href: '#/lessons', icon: '🎓', name: 'أساسيات الموسيقى', what: 'دروس قصيرة واختبار' },
    ],
  },
  {
    id: 'pitch',
    icon: '🎯',
    title: 'النغمة والودن',
    what: 'تمسكي النغمة وتسمعيها',
    items: [
      { href: '#/findnote', icon: '🪜', name: 'إزاي أجيب دو صح؟', what: 'خطوة بخطوة لحد ما تمسكي النغمة' },
      { href: '#/match', icon: '🎯', name: 'مطابقة النغمة', what: 'اسمعي نغمة وغنيها' },
      { href: '#/piano', icon: '🎹', name: 'البيانو', what: 'اختاري نغمة وغنيها' },
      { href: '#/game', icon: '🎮', name: 'لعبة الصوت', what: 'العصفورة بتمشي مع صوتك' },
      { href: '#/ear', icon: '👂', name: 'تدريب الودن', what: 'سماع بس، من غير غنا' },
      { href: '#/intervals', icon: '📐', name: 'غنا الفواصل', what: 'خامسة وتالتة وأوكتاف' },
    ],
  },
  {
    id: 'voice',
    icon: '🌬️',
    title: 'الصوت والنفس',
    what: 'إحماء، نفس، ومساحة صوتك',
    items: [
      { href: '#/warmup', icon: '🌿', name: 'الإحماء', what: '٣ دقايق قبل أي تمرين' },
      { href: '#/breath', icon: '🌬️', name: 'النفس', what: 'طول النفس وثبات الصوت' },
      { href: '#/range', icon: '📏', name: 'اختبار المساحة', what: 'أوطى وأعلى نغمة عندك' },
      { href: '#/vocalise', icon: '🎶', name: 'تمارين الصوت', what: 'فوكاليز طالعة نص تون نص تون' },
      { href: '#/piano/vocalise', icon: '🎹', name: 'فوكاليز على البيانو', what: 'كل نغمة بتتحكم بالسنت' },
      { href: '#/dynamics', icon: '🎚️', name: 'العالي والواطي', what: 'علّي ووطّي على نفس النغمة' },
    ],
  },
  {
    id: 'maqam',
    icon: '🎼',
    title: 'المقامات والإيقاع',
    what: 'الربع تون والضربة',
    items: [
      { href: '#/maqam', icon: '🎼', name: 'المقامات', what: 'غني درجات المقام' },
      { href: '#/key', icon: '🔎', name: 'اكتشف المقام', what: 'التطبيق يسمع ويقول المقام' },
      { href: '#/rhythm', icon: '🥁', name: 'الإيقاع', what: 'صقّفي على الضربة' },
    ],
  },
  {
    id: 'songs',
    icon: '📚',
    title: 'الأغاني',
    what: 'غني مع أغانيكي',
    items: [
      { href: '#/songs', icon: '📚', name: 'مكتبة أغانيّ', what: 'أغانيكي وتعلّميها جملة جملة' },
      { href: '#/sing', icon: '🎵', name: 'غني مع الأغنية', what: 'ملف صوت أو يوتيوب' },
      { href: '#/car', icon: '🚗', name: 'وضع العربية', what: 'جلسة بالصوت بس' },
    ],
  },
];

function Row({ href, icon, title, what }: { href: string; icon: string; title: string; what: string }) {
  return (
    <a className="list-row ex-row" href={href}>
      <span className="row-icon" aria-hidden>
        {icon}
      </span>
      <span>
        <span className="row-main">{title}</span>
        <span className="row-label">{what}</span>
      </span>
      <span className="chev" aria-hidden>
        ‹
      </span>
    </a>
  );
}

/** #/exercises (the groups) and #/exercises/<group> (its exercises). */
export function ExercisesPage() {
  const id = window.location.hash.replace(/^#\/?/, '').split('/')[1];
  const group = GROUPS.find((x) => x.id === id);
  if (group)
    return (
      <Page help="exercises" title={`${group.icon} ${group.title}`}>
        <div className="ex-list">
          {group.items.map((it) => (
            <Row key={it.href + it.name} href={it.href} icon={it.icon} title={it.name} what={it.what} />
          ))}
        </div>
      </Page>
    );
  return (
    <Page help="exercises" title="التمارين">
      <div className="ex-list">
        {GROUPS.map((x) => (
          <Row key={x.id} href={`#/exercises/${x.id}`} icon={x.icon} title={x.title} what={x.what} />
        ))}
      </div>
    </Page>
  );
}
