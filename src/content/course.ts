// "🎤 كورس الصوت": one step-by-step vocal course, from the simplest to the hardest. Every exercise runs one of the
// app's existing engines (breath, hum, pitch matching, the note ladder, piano vocalises, sirens, dynamics, intervals,
// maqam scales, the phrase-by-phrase song loop) with a fixed setting and a clear goal. The rules (passing, unlocking,
// today's workout) are in lib/course.ts. Edit the wording and the goals here.

import type { VideoKey } from './videos';
import type { DynamicsKind } from '../lib/dynamics';
import type { TempoId } from '../lib/pianoVocalise';

/** Which existing exercise runs, and how it's set up. Notes always come from her comfortable range. */
export type CourseEngine =
  | { kind: 'hiss' }
  | { kind: 'sustain' }
  | { kind: 'stability' }
  /** pitch matching: one note in the middle of her voice, the middle half, or the whole comfortable range */
  | { kind: 'match'; span: 'one' | 'mid' | 'full' }
  /** "إزاي أجيب دو صح؟": do re mi fa sol and back */
  | { kind: 'ladder' }
  | { kind: 'trill' }
  /** wide = a little past the comfortable range, through the passage between chest and head voice */
  | { kind: 'siren'; wide?: boolean }
  /**
   * A piano vocalise (lib/vocalise.ts patterns), climbing a semitone after each good round and coming back down.
   * zone 'top' / 'bottom' = starts near the top / bottom of her range and may go up to 2 semitones past it.
   */
  | { kind: 'pattern'; pattern: string; tempo: TempoId; zone?: 'top' | 'bottom' }
  /** a maqam scale up its octave and back down, quarter tones kept */
  | { kind: 'maqamScale'; maqam: string; tempo: TempoId }
  | { kind: 'dynamics'; shape: DynamicsKind }
  /** interval singing at a fixed level (index into INTERVAL_LEVELS) */
  | { kind: 'intervals'; level: number }
  /** a song from her library, phrase by phrase */
  | { kind: 'song' };

/** What counts as "done" in one go. */
export type CourseGoal =
  | { kind: 'seconds'; min: number }
  /** lower is better: pitch shake (stability) or distance from the siren line */
  | { kind: 'cents'; max: number }
  /** right notes in one round of a pattern (`of` = the pattern's length) */
  | { kind: 'notes'; min: number; of: number }
  /** a score in %, with at least `tries` attempts when it's pitch matching / intervals */
  | { kind: 'percent'; min: number; tries?: number }
  /** phrases of one song sung well (the phrase loop's goal) on the same day */
  | { kind: 'phrases'; min: number };

export interface CourseExercise {
  id: string;
  title: string;
  /** one line: what it trains and why */
  what: string;
  /** "إزاي": 2–4 short numbered steps */
  how: string[];
  engine: CourseEngine;
  goal: CourseGoal;
  video: VideoKey;
  /** false = never part of today's workout (a song needs a file and more time) */
  daily?: false;
  /** works at the edges of her voice: never on a light day */
  strain?: true;
}

export interface CourseLevel {
  n: number;
  icon: string;
  title: string;
  /** the level's goal, one sentence */
  goal: string;
  /** "ليه المستوى ده مهم" */
  why: string;
  /** an extra safety note shown on the level (the high/low level) */
  care?: string;
  exercises: CourseExercise[];
}

export const COURSE: CourseLevel[] = [
  {
    n: 1,
    icon: '🌱',
    title: 'الأساس',
    goal: 'تقفي صح، تتنفسي من بطنك، وتمسكي نغمة واحدة مريحة.',
    why: 'كل حاجة بعد كده مبنية على النفس الهادي وأول نغمة مظبوطة — زي أساس البيت.',
    exercises: [
      {
        id: 'l1-breath',
        title: 'الوقفة والنفس من البطن',
        what: 'النفس من البطن هو وقود الصوت: بيخليه ثابت ومن غير ما الزور يتعب.',
        how: ['اقفي مفرودة: رجليكي بعرض كتافك، وكتافك نازلة ومرتاحة.', 'حطي إيدك على بطنك: مع الشهيق تكبر، والكتاف متتحركش.', 'اتبعي الدايرة: شهيق، كتم، وبعدين "سسسس" هادية ومنتظمة.'],
        engine: { kind: 'hiss' },
        goal: { kind: 'seconds', min: 8 },
        video: 'posture',
      },
      {
        id: 'l1-hum',
        title: 'همهمة على نغمة مريحة',
        what: 'الهمهمة بتصحّي الصوت من غير مجهود، وبتعلّمك تفضلي على نغمة واحدة.',
        how: ['اسمعي النغمة.', 'شفايفك مقفولة بالراحة، وقولي "مممم" على نفس النغمة.', 'خليها هادية وثابتة لحد ما النفس يخلص.'],
        engine: { kind: 'sustain' },
        goal: { kind: 'seconds', min: 4 },
        video: 'humming',
      },
      {
        id: 'l1-match',
        title: 'مطابقة نغمة واحدة',
        what: 'أول خطوة في الغنا الصح: تسمعي نغمة وتطلّعي زيها بالظبط.',
        how: ['اسمعي النغمة كويس.', 'غنيها "آآآ" بهدوء.', 'لو المؤشر قال أعلى أو أوطى، اتحركي بالراحة لحد ما تثبتي ثانية.'],
        engine: { kind: 'match', span: 'one' },
        goal: { kind: 'percent', min: 60, tries: 5 },
        video: 'matchPitch',
      },
    ],
  },
  {
    n: 2,
    icon: '🎯',
    title: 'ثبات النغمة',
    goal: 'تمسكي النغمة من غير ما تتهز، وتطلعي وتنزلي سلم صغير مظبوط.',
    why: 'النغمة الثابتة هي اللي بتخلي الصوت واثق ومظبوط، حتى في أبسط أغنية أو ترنيمة.',
    exercises: [
      {
        id: 'l2-hold',
        title: 'نغمة ثابتة ٥ ثواني',
        what: 'بيدرّب الصوت يفضل على النغمة من غير اهتزاز.',
        how: ['خدي نفس من بطنك.', 'غني نغمة مريحة "آآآ" بصوت متوسط.', 'متزوديش ومتقلليش — خليها خط مستقيم لحد ما العداد يخلص.'],
        engine: { kind: 'stability' },
        goal: { kind: 'cents', max: 25 },
        video: 'sustain',
      },
      {
        id: 'l2-ladder',
        title: 'دو ري مي طالع ونازل',
        what: 'بتتعلمي تمشي من نغمة للي بعدها خطوة خطوة ومن غير ما تتوهي.',
        how: ['اسمعي النغمة وهمهمي عليها.', 'حركي صوتك لحد ما النقطة تقعد على الخط.', 'اثبتي ثانية، وهو بينقلك للنغمة اللي بعدها.'],
        engine: { kind: 'ladder' },
        goal: { kind: 'notes', min: 7, of: 9 },
        video: 'doremi',
      },
      {
        id: 'l2-five',
        title: 'سلم الخمس نغمات "آه" على مهلك',
        what: 'أشهر تمرين في الدنيا: بيسخّن الصوت ويعلّم الانتقال الناعم بين النغمات.',
        how: ['دوسي «🔊 اسمعي» وبصي على المفاتيح وهي بتنور.', 'دوسي «🎤 دورك» وغني نفس النغمات "آه".', 'كل نغمة لازم تثبت عليها لحظة قبل اللي بعدها.'],
        engine: { kind: 'pattern', pattern: 'five', tempo: 'slow' },
        goal: { kind: 'notes', min: 7, of: 9 },
        video: 'vocalise-five',
      },
      {
        id: 'l2-match',
        title: 'نغمات من نص صوتك',
        what: 'نغمات مختلفة كل مرة، فودنك وصوتك يتعودوا يلاقوا أي نغمة.',
        how: ['اسمعي النغمة.', 'غنيها واثبتي ثانية.', 'دوسي على النغمة اللي بعدها وكملي.'],
        engine: { kind: 'match', span: 'mid' },
        goal: { kind: 'percent', min: 70, tries: 5 },
        video: 'matchPitch',
      },
    ],
  },
  {
    n: 3,
    icon: '🌊',
    title: 'المساحة المريحة',
    goal: 'تتنقلي بنعومة في كل المنطقة المريحة لصوتك، من تحت لفوق.',
    why: 'الصوت المرن في النص هو اللي هيوصّلك بعدين للعالي والواطي من غير ما تتعبي.',
    exercises: [
      {
        id: 'l3-trill',
        title: 'بررر (ترعيش الشفايف)',
        what: 'بيرخّي الصوت ويوزّع النفس بالتساوي — أحسن تسخين للمساحة كلها.',
        how: ['قفلي شفايفك بالراحة وطلّعي هوا يرعّشهم "بررر".', 'لو صعب، حطي صوابعك على خدودك وزقيهم لفوق شوية.', 'كملي على قد الوقت، وخدي نفس كل ما تحتاجي.'],
        engine: { kind: 'trill' },
        goal: { kind: 'seconds', min: 15 },
        video: 'lipTrill',
      },
      {
        id: 'l3-siren',
        title: 'السيرينة "وووو"',
        what: 'تزحلقي لفوق ولتحت من غير سلالم، فالصوت يعدّي بين الطبقات بنعومة.',
        how: ['دوسي «🔊 اسمعي المثال».', 'قولي "وووو" وامشي مع الخط لفوق ولتحت، زي الإسعاف بس هادي.', 'لو الخط علي عليكي، خليها أخف مش أعلى.'],
        engine: { kind: 'siren' },
        goal: { kind: 'cents', max: 150 },
        video: 'siren',
      },
      {
        id: 'l3-arp',
        title: 'أربيجيو ١-٣-٥-٣-١ "ما مي ما"',
        what: 'نطّات صغيرة مظبوطة، وبتوضّح الكلام وانتي بتغني.',
        how: ['اسمعي النمط على البيانو.', 'غنيه "ما مي ما مي ما".', 'افتحي بقك كويس في "ما"، وابتسمي شوية في "مي".'],
        engine: { kind: 'pattern', pattern: 'arp', tempo: 'medium' },
        goal: { kind: 'notes', min: 4, of: 5 },
        video: 'vocalise-arp',
      },
      {
        id: 'l3-octave',
        title: 'زحلقة أوكتاف "وو"',
        what: 'بتوصل بين أوطى وأعلى نغمة في الجملة من غير قطع.',
        how: ['اسمعي الزحلقة.', 'ابدئي من تحت وزحلقي لفوق "ووو" من غير ما تقطعي، وارجعي.', 'فوق: أخف مش أعلى.'],
        engine: { kind: 'pattern', pattern: 'octave', tempo: 'slow' },
        goal: { kind: 'notes', min: 2, of: 3 },
        video: 'vocalise-octave',
      },
    ],
  },
  {
    n: 4,
    icon: '🌬️',
    title: 'النفس والجملة الطويلة',
    goal: 'تكمّلي جملة طويلة على نفس واحد، وتتحكمي في الصوت يعلى ويوطى.',
    why: 'الأغاني فيها جمل طويلة؛ لو النفس خلص في النص الصوت بيقع. والتحكم في العلو هو اللي بيدّي الإحساس.',
    exercises: [
      {
        id: 'l4-sustain',
        title: 'نغمة ممدودة',
        what: 'بتطوّل النفس وبتعلمك تصرفيه بالراحة.',
        how: ['شهيق من بطنك.', 'امدّي النغمة "آآآ" بصوت هادي وثابت.', 'مش لازم عالي — المهم الصوت ميقعش في الآخر.'],
        engine: { kind: 'sustain' },
        goal: { kind: 'seconds', min: 10 },
        video: 'breathing',
      },
      {
        id: 'l4-hiss',
        title: 'سسسس طويلة',
        what: 'بتقوّي العضلات اللي بتسند النفس.',
        how: ['اتبعي الدايرة: شهيق وكتم.', 'طلّعي "سسسس" رفيعة ومنتظمة.', 'بطنك ترجع بالراحة، والكتاف ثابتة.'],
        engine: { kind: 'hiss' },
        goal: { kind: 'seconds', min: 20 },
        video: 'hiss',
      },
      {
        id: 'l4-scale8',
        title: 'سلم أوكتاف على نفس واحد',
        what: 'جملة طويلة: ٨ نغمات طالعة ونازلة من غير ما تاخدي نفس في النص.',
        how: ['اسمعي السلم كله.', 'خدي نفس كويس قبل «🎤 دورك».', 'غني كله على نفس واحد، والنغمات العالية خفيفة.'],
        engine: { kind: 'pattern', pattern: 'scale8', tempo: 'medium' },
        goal: { kind: 'notes', min: 12, of: 15 },
        video: 'doremi',
      },
      {
        id: 'l4-cresc',
        title: 'من واطي لعالي',
        what: 'تعلّي الصوت بالراحة على نفس النغمة من غير ما النغمة تطلع.',
        how: ['اسمعي النغمة.', 'ابدئي هادي جدًا، وعلّي شوية شوية.', 'النغمة نفسها متتحركش — العلو بس اللي يزيد.'],
        engine: { kind: 'dynamics', shape: 'cresc' },
        goal: { kind: 'percent', min: 60 },
        video: 'dynamics',
      },
      {
        id: 'l4-messa',
        title: 'واطي ← عالي ← واطي',
        what: 'أصعب تحكم في النفس: الصوت يكبر ويرجع يصغر وهو ثابت.',
        how: ['ابدئي هادي.', 'علّي لحد النص.', 'وارجعي هادي تاني لحد الآخر، من غير ما النغمة تتهز.'],
        engine: { kind: 'dynamics', shape: 'messa' },
        goal: { kind: 'percent', min: 60 },
        video: 'dynamics',
      },
    ],
  },
  {
    n: 5,
    icon: '📐',
    title: 'الدقة والفواصل',
    goal: 'تنطّي لأي نغمة وتوصليلها مظبوط، وتعيدي جملة سمعتيها.',
    why: 'الألحان مش بتمشي خطوة خطوة بس — فيها نطّات. لازم ودنك وصوتك يتفقوا على المسافة.',
    exercises: [
      {
        id: 'l5-int1',
        title: 'فواصل: خامسة وأوكتاف',
        what: 'أسهل نطّات وأوضحها — بداية الإحساس بالمسافة.',
        how: ['اسمعي النغمة الأولى.', 'غني المسافة المطلوبة واثبتي ثانية.', 'لو صعبة دوسي «اسمعي الإجابة».'],
        engine: { kind: 'intervals', level: 0 },
        goal: { kind: 'percent', min: 70, tries: 5 },
        video: 'intervals',
      },
      {
        id: 'l5-int2',
        title: 'فواصل: التالتات والرابعة',
        what: 'المسافات اللي في أغلب الألحان.',
        how: ['اسمعي النغمة الأولى.', 'افتكري الأغنية المكتوبة جنب المسافة لو بتساعدك.', 'غنيها واثبتي ثانية.'],
        engine: { kind: 'intervals', level: 1 },
        goal: { kind: 'percent', min: 70, tries: 5 },
        video: 'intervals',
      },
      {
        id: 'l5-jumps',
        title: 'نطّات "يا"',
        what: 'تنطّي من القرار لنغمة بعيدة وترجعي له مظبوط.',
        how: ['اسمعي النطّات.', 'غني "يا" على كل نغمة.', 'فكري في النغمة قبل ما تغنيها — متزحلقيش ليها.'],
        engine: { kind: 'pattern', pattern: 'jumps', tempo: 'medium' },
        goal: { kind: 'notes', min: 4, of: 5 },
        video: 'intervals',
      },
      {
        id: 'l5-echo',
        title: 'اسمعي الجملة وغنيها',
        what: 'زي ما بتتعلمي لحن جديد: تسمعيه مرة وتعيديه.',
        how: ['دوسي «🔊 اسمعي» مرة أو اتنين.', 'غني الجملة "لا لا لا" زي ما هي.', 'لو نغمة طلعت ✘، اسمعي تاني وركزي عليها.'],
        engine: { kind: 'pattern', pattern: 'echo', tempo: 'medium' },
        goal: { kind: 'notes', min: 6, of: 7 },
        video: 'matchPitch',
      },
      {
        id: 'l5-match',
        title: 'نغمات من كل صوتك',
        what: 'أي نغمة في المساحة المريحة كلها، بالترتيب العشوائي.',
        how: ['اسمعي.', 'غني واثبتي ثانية.', 'كملي لحد ٥ محاولات على الأقل.'],
        engine: { kind: 'match', span: 'full' },
        goal: { kind: 'percent', min: 80, tries: 5 },
        video: 'matchPitch',
      },
    ],
  },
  {
    n: 6,
    icon: '⚡',
    title: 'المرونة والسرعة',
    goal: 'صوتك يتحرك بسرعة وخفة من غير ما يفقد الدقة.',
    why: 'الآهات والعُرب والجمل السريعة محتاجة صوت خفيف ومرن — ودي بتيجي بالتدريج: بطيء الأول وبعدين أسرع.',
    exercises: [
      {
        id: 'l6-five',
        title: '١-٢-٣-٤-٥-٤-٣-٢-١',
        what: 'السلم اللي اتعلمتيه، بسرعة عادية ومظبوط أكتر.',
        how: ['اسمعي.', 'غني "آه" على نفس واحد.', 'كل نغمة واضحة لوحدها.'],
        engine: { kind: 'pattern', pattern: 'five', tempo: 'medium' },
        goal: { kind: 'notes', min: 8, of: 9 },
        video: 'vocalise-five',
      },
      {
        id: 'l6-five-fast',
        title: 'نفس السلم سريع',
        what: 'السرعة من غير ما الصوت يتزحلق.',
        how: ['اسمعي النسخة السريعة.', 'خدي نفس وغنيها كلها مرة واحدة.', 'صوت خفيف — السرعة بتحتاج خفة مش قوة.'],
        engine: { kind: 'pattern', pattern: 'five', tempo: 'fast' },
        goal: { kind: 'notes', min: 7, of: 9 },
        video: 'vocalise-five',
      },
      {
        id: 'l6-staccato',
        title: 'ستاكاتو "ها ها ها"',
        what: 'نغمات قصيرة منفصلة من البطن — بتقوّي سند النفس وبتخلي الصوت نضيف.',
        how: ['حطي إيدك على بطنك.', 'كل "ها" نطّة صغيرة من البطن.', 'سكتة صغيرة بين كل "ها" واللي بعدها.'],
        engine: { kind: 'pattern', pattern: 'staccato', tempo: 'medium' },
        goal: { kind: 'notes', min: 4, of: 5 },
        video: 'vocalise-staccato',
      },
      {
        id: 'l6-run-slow',
        title: 'رَن "آه" على مهلك',
        what: 'نغمات كتير على حرف واحد — أساس الآهات والعُرب.',
        how: ['اسمعي ببطء.', 'غني كل النغمات على "آه" واحدة من غير ما تقطعي.', 'ركزي إن كل نغمة تبان.'],
        engine: { kind: 'pattern', pattern: 'melisma', tempo: 'slow' },
        goal: { kind: 'notes', min: 7, of: 9 },
        video: 'melisma',
      },
      {
        id: 'l6-run-fast',
        title: 'رَن "آه" أسرع',
        what: 'نفس الزخرفة بسرعة أقرب للأغاني.',
        how: ['اسمعي.', 'غنيها بخفة.', 'لو اتلخبطتي ارجعي للبطيء يوم كمان — ده طبيعي.'],
        engine: { kind: 'pattern', pattern: 'melisma', tempo: 'medium' },
        goal: { kind: 'notes', min: 7, of: 9 },
        video: 'melisma',
      },
    ],
  },
  {
    n: 7,
    icon: '🦋',
    title: 'الطبقات العالية والواطية بأمان',
    goal: 'توسّعي صوتك نص تون نص تون، وتعدّي بين صوت الصدر وصوت الراس بنعومة.',
    why: 'المساحة بتكبر بالراحة والصبر مش بالزق. والعدّاية الناعمة بين الصدر والراس بتخلي النغمات العالية سهلة ومش مزعقة.',
    care: 'هنا بالذات: صوت خفيف وهادي. لو نغمة شدّت عليكي أو حسيتي بزغزغة في الزور، انزلي نص تون أو وقفي. متزقيش صوتك أبدًا — الطبقات بتيجي مع الأيام.',
    exercises: [
      {
        id: 'l7-nee',
        title: '"ني ني ني"',
        what: 'بتقدّم الصوت لقدّام فالنغمات العالية تبقى أسهل وأوضح.',
        how: ['اسمعي.', 'غني "ني" بابتسامة صغيرة.', 'حسي الصوت عند مناخيرك وسنانك القدّامية، مش في الزور.'],
        engine: { kind: 'pattern', pattern: 'nee', tempo: 'medium' },
        goal: { kind: 'notes', min: 7, of: 9 },
        video: 'vocalise-nee',
      },
      {
        id: 'l7-octave',
        title: 'زحلقة لصوت الراس',
        what: 'تعدّي من صوت الصدر لصوت الراس من غير كسرة.',
        how: ['ابدئي "وو" من تحت بصوتك العادي.', 'وانتي طالعة خففي الصوت وسيبيه يروح للراس.', 'لو الصوت اتكسر عادي — جربي أخف وأبطأ.'],
        engine: { kind: 'pattern', pattern: 'octave', tempo: 'slow', zone: 'top' },
        goal: { kind: 'notes', min: 2, of: 3 },
        video: 'passaggio',
        strain: true,
      },
      {
        id: 'l7-siren',
        title: 'سيرينة واسعة',
        what: 'سيرينة بتعدّي حدود صوتك المريحة بنص تون، بالراحة.',
        how: ['قولي "وووو" هادية جدًا.', 'امشي مع الخط لفوق ولتحت.', 'فوق خليها رفيعة وخفيفة — من غير زق.'],
        engine: { kind: 'siren', wide: true },
        goal: { kind: 'cents', max: 150 },
        video: 'passaggio',
        strain: true,
      },
      {
        id: 'l7-up',
        title: 'لفوق نص تون نص تون',
        what: 'السلم بيبتدي قريب من أعلى صوتك ويطلع نص تون بعد كل مرة حلوة.',
        how: ['غني السلم خفيف.', 'كل مرة حلوة بيطلع نص تون لوحده.', 'لو النغمة شدّت، دوسي «⬇ نص تون» وكملي هناك.'],
        engine: { kind: 'pattern', pattern: 'five', tempo: 'medium', zone: 'top' },
        goal: { kind: 'notes', min: 7, of: 9 },
        video: 'passaggio',
        strain: true,
      },
      {
        id: 'l7-down',
        title: 'لتحت نص تون نص تون',
        what: 'النغمات الواطية بتتبني بهدوء زي العالية.',
        how: ['غني السلم بصوت مريح، مش مضغوط.', 'كل مرة حلوة بينزل نص تون.', 'لو الصوت بقى همس أو خشن، كفاية كده النهارده.'],
        engine: { kind: 'pattern', pattern: 'five', tempo: 'slow', zone: 'bottom' },
        goal: { kind: 'notes', min: 7, of: 9 },
        video: 'vocalise-five',
        strain: true,
      },
    ],
  },
  {
    n: 8,
    icon: '🎼',
    title: 'المقامات والزخارف العربية',
    goal: 'تغني بالربع تون والزخارف العربي، وتطبقي كل ده على أغنية حقيقية.',
    why: 'ده اللي بيدّي الغنا العربي والترانيم الشرقية طعمهم: الربع تون، والعُرب، والجملة اللي بتتقال بإحساس.',
    exercises: [
      {
        id: 'l8-rast',
        title: 'سلم راست',
        what: 'أشهر مقام عربي، وفيه التالتة ربع تون.',
        how: ['اسمعي السلم وبصي على الربع تون وهو بينور.', 'غنيه "آه" طالع ونازل.', 'التالتة بين مي ومي بيمول — مش دي ولا دي.'],
        engine: { kind: 'maqamScale', maqam: 'rast', tempo: 'slow' },
        goal: { kind: 'notes', min: 12, of: 15 },
        video: 'maqam',
      },
      {
        id: 'l8-bayati',
        title: 'سلم بياتي',
        what: 'مقام دافي، والتانية فيه ربع تون.',
        how: ['اسمعي.', 'غني "آه" طالع ونازل.', 'التانية قريبة من القرار أكتر من العادي.'],
        engine: { kind: 'maqamScale', maqam: 'bayati', tempo: 'slow' },
        goal: { kind: 'notes', min: 12, of: 15 },
        video: 'maqam',
      },
      {
        id: 'l8-phrase',
        title: 'جملة راست قصيرة',
        what: 'من السلم للحن: جملة صغيرة بالربع تون.',
        how: ['اسمعي الجملة مرتين.', 'غنيها "آه".', 'خلي الربع تون في مكانه بالظبط.'],
        engine: { kind: 'pattern', pattern: 'rast-phrase', tempo: 'slow' },
        goal: { kind: 'notes', min: 6, of: 7 },
        video: 'maqam',
      },
      {
        id: 'l8-turn',
        title: 'دوران حوالين النغمة',
        what: 'أبسط زخرفة عربي: فوق النغمة وتحتها وترجعي لها.',
        how: ['اسمعي الدوران ببطء.', 'غنيه على "آه" واحدة.', 'بعد ما يبقى سهل، هو بيطلع نص تون لوحده.'],
        engine: { kind: 'pattern', pattern: 'turn', tempo: 'slow' },
        goal: { kind: 'notes', min: 4, of: 5 },
        video: 'ornaments',
      },
      {
        id: 'l8-bayati-turn',
        title: 'زخرفة بياتي',
        what: 'دوران صغير فيه الربع تون — زي العُرب في الأغاني والترانيم.',
        how: ['اسمعي.', 'غنيه خفيف على "آه".', 'الربع تون صغير: متطلعيهوش نغمة كاملة.'],
        engine: { kind: 'pattern', pattern: 'bayati-turn', tempo: 'slow' },
        goal: { kind: 'notes', min: 4, of: 5 },
        video: 'ornaments',
      },
      {
        id: 'l8-song',
        title: 'أغنية جملة جملة',
        what: 'كل اللي اتعلمتيه على أغنية أو ترنيمة بتحبيها.',
        how: ['اختاري أغنية من مكتبتك فيها ملف صوت.', 'افتحيها جملة جملة: اسمعي، وبعدين غني مع المؤشر.', 'كملي لحد ما ٣ جمل يوصلوا للهدف في نفس اليوم.'],
        engine: { kind: 'song' },
        goal: { kind: 'phrases', min: 3 },
        video: 'ornaments',
        daily: false,
      },
    ],
  },
];

/** The last step after level 8: one full song from her library, every phrase learned in the phrase loop. */
export const GRADUATION = {
  title: '🎓 التخرج',
  what: 'أغنية أو ترنيمة كاملة من اختيارك، جملة جملة لحد ما كل الجمل تتعلم.',
  how: ['اختاري أغنية من مكتبتك فيها ملف صوت.', 'افتحيها جملة جملة، وكل جملة كرريها لحد ما توصل للهدف.', 'لما كل الجمل تاخد ✔، تبقي اتخرجتي من الكورس.'],
};

/** Short, friendly safety notes shown on the course page. */
export const COURSE_SAFETY = [
  'صوت هادي ومريح — الغنا الحلو مش زعيق.',
  'لو حاجة وجعت أو الصوت اتبح: وقفي وريّحي.',
  'متزقيش النغمات العالية؛ بتيجي لوحدها مع الأيام.',
  'أيام الراحة جزء من التمرين، واشربي مية كتير.',
];
