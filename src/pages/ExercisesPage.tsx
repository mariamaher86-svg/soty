import { Page } from '../components/ui';

/** All exercises grouped by what they train, each with one line on what it does. */
const SECTIONS: { title: string; items: { href: string; icon: string; name: string; what: string }[] }[] = [
  {
    title: 'ابدئي من هنا',
    items: [
      { href: '#/path', icon: '🌱', name: 'مسار المبتدئ', what: 'تمرين النهارده جاهز، وقياس كل أسبوع.' },
      { href: '#/lessons', icon: '🎓', name: 'أساسيات الموسيقى', what: 'دروس صغيرة: النغمة، دو ري مي، المقام، الإيقاع.' },
    ],
  },
  {
    title: 'الإحماء',
    items: [{ href: '#/warmup', icon: '🌿', name: 'الإحماء', what: '٣ دقايق: بررر، سيرينة، وهمهمة قبل أي تمرين.' }],
  },
  {
    title: 'النفس',
    items: [{ href: '#/breath', icon: '🌬️', name: 'النفس', what: 'طول النفس، ثبات الصوت، وتمرين سسسس.' }],
  },
  {
    title: 'الطبقات والمساحة',
    items: [
      { href: '#/range', icon: '📏', name: 'اختبار المساحة الصوتية', what: 'أوطى وأعلى نغمة، وطبقة صوتك.' },
      { href: '#/vocalise', icon: '🎶', name: 'تمارين الصوت (فوكاليز)', what: '"آه ها ها آآآ" طالعة نص تون نص تون في كل صوتك.' },
      { href: '#/warmup', icon: '🚑', name: 'السيرينة (في الإحماء)', what: 'زحلقة ناعمة لفوق ولتحت مع خط.' },
    ],
  },
  {
    title: 'العالي والواطي',
    items: [{ href: '#/dynamics', icon: '🎚️', name: 'العالي والواطي', what: 'علّي ووطّي الصوت بالراحة على نفس النغمة (ومسا دي فوتشي).' }],
  },
  {
    title: 'النغمة',
    items: [
      { href: '#/findnote', icon: '🪜', name: 'إزاي أجيب دو صح؟', what: 'سلم بالنغمات ونقطة لصوتك — خطوة بخطوة لحد ما تمسكي النغمة.' },
      { href: '#/piano', icon: '🎹', name: 'البيانو', what: 'اختاري أي نغمة من البيانو كله وغنّيها — أو شوفي بتغني إيه.' },
      { href: '#/match', icon: '🎯', name: 'مطابقة النغمة', what: 'اسمعي نغمة وغنيها مظبوط بالمؤشر.' },
      { href: '#/game', icon: '🎮', name: 'لعبة الصوت', what: 'عصفورة بتطلع وتنزل مع صوتك — دخّليها البوابات.' },
    ],
  },
  {
    title: 'الودن',
    items: [{ href: '#/ear', icon: '👂', name: 'تدريب الودن', what: 'أعلى/أوطى، الفرق الصغير، المسافات، المقامات — سماع بس.' }],
  },
  {
    title: 'الإيقاع',
    items: [{ href: '#/rhythm', icon: '🥁', name: 'الإيقاع', what: 'مترونوم، وصقّفي على الضربة: بدري ولا متأخر بالملي ثانية.' }],
  },
  {
    title: 'الفواصل',
    items: [{ href: '#/intervals', icon: '🪜', name: 'غنا الفواصل', what: 'اسمعي نغمة وغني خامسة/تالتة/أوكتاف فوقها.' }],
  },
  {
    title: 'المقامات',
    items: [
      { href: '#/maqam', icon: '🎼', name: 'المقامات', what: 'غني درجات راست وبياتي وحجاز… بالربع تون.' },
      { href: '#/key', icon: '🔎', name: 'اكتشف المقام', what: 'التطبيق يسمع الأغنية ويقول سلمها أو مقامها.' },
    ],
  },
  {
    title: 'الأغاني',
    items: [
      { href: '#/songs', icon: '📚', name: 'مكتبة أغانيّ', what: 'أغانيكي، ومنها «تعلّمي الأغنية جملة جملة».' },
      { href: '#/sing', icon: '🎵', name: 'غني مع الأغنية', what: 'ملف صوت أو يوتيوب، مع تكرار الحتة الصعبة.' },
      { href: '#/songs', icon: '🎼', name: 'صوتك في الكورال', what: 'ملف لكل صوت: صوتك لوحده، عالي، أو الكورال من غيرك.' },
    ],
  },
  {
    title: 'من غير ما تبصي على الموبايل',
    items: [{ href: '#/car', icon: '🚗', name: 'وضع العربية', what: 'جلسة بالصوت بس.' }],
  },
];

export function ExercisesPage() {
  return (
    <Page help="exercises" title="🏋️ التمارين" intro="متقسمة حسب اللي بتدرّبه.">
      {SECTIONS.map((sec) => (
        <section key={sec.title} className="ex-section">
          <h2>{sec.title}</h2>
          <div className="list">
            {sec.items.map((it) => (
              <a key={it.href + it.name} className="list-row" href={it.href}>
                <span className="row-icon" aria-hidden>
                  {it.icon}
                </span>
                <span className="row-text">
                  <span className="row-main">{it.name}</span>
                  <span className="row-label">{it.what}</span>
                </span>
                <span className="chev" aria-hidden>
                  ‹
                </span>
              </a>
            ))}
          </div>
        </section>
      ))}
    </Page>
  );
}
