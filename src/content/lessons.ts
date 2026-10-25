// "أساسيات الموسيقى": short lessons for complete beginners, in one place so they're easy to edit.
// Sounds are written as semitone offsets from C in the user's own octave (fractions = quarter tones);
// "maqam" plays a scale from the maqam table. Button labels in the UI follow the girl/boy setting automatically.

import { MAQAMAT } from '../lib/maqam';

export type LessonId = 'note' | 'solfege' | 'octave' | 'tone' | 'scale' | 'quarter' | 'maqam' | 'cents' | 'tune' | 'rhythm';

/** Something to play: notes one after another (offsets from C, semitones), or a maqam scale. */
export interface Sound {
  notes?: number[];
  maqam?: string;
  /** seconds per note */
  dur?: number;
  /** metronome clicks instead of notes: beat positions (in beats) at `bpm`, beat 1 of each bar accented */
  clicks?: { bpm: number; beats: number[]; perBar?: number };
}

export interface Example {
  label: string;
  sound: Sound;
}

export interface LessonScreen {
  title: string;
  text: string[];
  examples: Example[];
  /** draw a one-octave keyboard with these keys (semitones from C) highlighted */
  keyboard?: number[];
  /** show the app's cents meter with these sample values */
  meter?: number[];
  /** links to exercises */
  links?: { href: string; label: string }[];
}

export interface QuizQuestion {
  q: string;
  /** listening question: play this first */
  sound?: Sound;
  options: string[];
  answer: number;
}

export interface Lesson {
  id: LessonId;
  icon: string;
  title: string;
  screens: LessonScreen[];
  quiz: QuizQuestion[];
}

/** Pass mark: 4 of 5. */
export const PASS_RATIO = 0.8;

const scale = (id: string): Sound => ({ maqam: id, dur: 0.5 });
const MAJOR = [0, 2, 4, 5, 7, 9, 11, 12];
const MINOR = [0, 2, 3, 5, 7, 8, 10, 12];

export const LESSONS: Lesson[] = [
  {
    id: 'note',
    icon: '🎵',
    title: 'يعني إيه نغمة؟',
    screens: [
      {
        title: 'النغمة: عالية أو واطية',
        text: ['النغمة = صوت ليه طبقة ثابتة.', 'الطبقة ممكن تبقى عالية (صوت رفيع) أو واطية (صوت تخين).'],
        examples: [
          { label: 'نغمة واطية', sound: { notes: [0], dur: 1.2 } },
          { label: 'نغمة عالية', sound: { notes: [9], dur: 1.2 } },
          { label: 'من الواطية للعالية', sound: { notes: [0, 4, 7, 9] } },
        ],
      },
      {
        title: 'كل نغمة ليها اسم',
        text: ['في العربي بنقول دو، ري، مي… وفي الإنجليزي C، D، E… — ده درس الجاي.', 'المهم دلوقتي: الودن بتعرف تفرّق العالي من الواطي، والتمرين بيقوّي ده.'],
        examples: [
          { label: '«دو»', sound: { notes: [0], dur: 1 } },
          { label: '«صول»', sound: { notes: [7], dur: 1 } },
        ],
      },
    ],
    quiz: [
      { q: 'النغمة التانية أعلى ولا أوطى؟', sound: { notes: [0, 7] }, options: ['أعلى', 'أوطى'], answer: 0 },
      { q: 'النغمة التانية أعلى ولا أوطى؟', sound: { notes: [9, 2] }, options: ['أعلى', 'أوطى'], answer: 1 },
      { q: 'النغمتين زي بعض ولا مختلفين؟', sound: { notes: [4, 4] }, options: ['زي بعض', 'مختلفين'], answer: 0 },
      { q: 'الصوت الرفيع يبقى نغمة:', options: ['عالية', 'واطية'], answer: 0 },
      { q: 'النغمة التانية أعلى ولا أوطى؟', sound: { notes: [5, 0] }, options: ['أعلى', 'أوطى'], answer: 1 },
    ],
  },
  {
    id: 'solfege',
    icon: '🎹',
    title: 'دو ري مي = C D E',
    screens: [
      {
        title: 'النغمات السبعة',
        text: ['دو، ري، مي، فا، صول، لا، سي', 'وبالإنجليزي: C، D، E، F، G، A، B', 'بعد «سي» بترجع «دو» تاني بس أعلى.'],
        keyboard: [0, 2, 4, 5, 7, 9, 11],
        examples: [{ label: 'دو ري مي فا صول لا سي دو', sound: { notes: MAJOR, dur: 0.55 } }],
      },
      {
        title: 'الترتيب بيتكرر',
        text: ['زي أيام الأسبوع: بعد آخر يوم بنبدأ من الأول.', 'دو مي صول = C E G، وصول لا سي دو = G A B C.'],
        keyboard: [0, 4, 7],
        examples: [
          { label: 'دو مي صول', sound: { notes: [0, 4, 7] } },
          { label: 'صول لا سي دو', sound: { notes: [7, 9, 11, 12] } },
        ],
      },
    ],
    quiz: [
      { q: '«مي» بالإنجليزي:', options: ['C', 'E', 'G'], answer: 1 },
      { q: 'بعد «صول» بييجي:', options: ['فا', 'لا', 'سي'], answer: 1 },
      { q: '«A» بالعربي:', options: ['لا', 'ري', 'دو'], answer: 0 },
      { q: 'دول أول ٣ نغمات في السلم. أساميهم:', sound: { notes: [0, 2, 4] }, options: ['دو ري مي', 'دو مي صول', 'صول لا سي'], answer: 0 },
      { q: 'بعد «سي» بنرجع:', options: ['دو', 'ري', 'لا'], answer: 0 },
    ],
  },
  {
    id: 'octave',
    icon: '🔁',
    title: 'الأوكتاف',
    screens: [
      {
        title: 'نفس النغمة… أعلى أو أوطى',
        text: ['الأوكتاف = نفس النغمة بس أعلى أو أوطى «دور» كامل.', 'دو ودو اللي بعدها: نفس الإحساس، واحدة رفيعة وواحدة تخينة.'],
        keyboard: [0, 12],
        examples: [
          { label: 'دو ودو أعلى', sound: { notes: [0, 12], dur: 1 } },
          { label: 'صول وصول أوطى', sound: { notes: [7, -5], dur: 1 } },
        ],
      },
      {
        title: 'صوت الرجالة وصوت الستات',
        text: ['صوت الرجالة غالبًا أوطى من صوت الستات بحوالي أوكتاف.', 'فلما يغنوا نفس اللحن بيبقوا أوكتاف بين بعض — وده مش غلط، ده طبيعي.'],
        examples: [{ label: 'نفس اللحن بأوكتافين', sound: { notes: [0, 4, 7, 12, 16, 19] } }],
      },
    ],
    quiz: [
      { q: 'النغمتين دول أوكتاف ولا نغمتين مختلفين؟', sound: { notes: [0, 12] }, options: ['أوكتاف (نفس النغمة)', 'مختلفين'], answer: 0 },
      { q: 'النغمتين دول أوكتاف ولا نغمتين مختلفين؟', sound: { notes: [0, 7] }, options: ['أوكتاف (نفس النغمة)', 'مختلفين'], answer: 1 },
      { q: 'راجل وست بيغنوا نفس اللحن — عادة بيبقى بينهم:', options: ['أوكتاف', 'ولا حاجة'], answer: 0 },
      { q: 'من «دو» لـ«دو» اللي بعدها:', options: ['أوكتاف', 'نص تون'], answer: 0 },
      { q: 'النغمتين دول أوكتاف ولا نغمتين مختلفين؟', sound: { notes: [9, -3] }, options: ['أوكتاف (نفس النغمة)', 'مختلفين'], answer: 0 },
    ],
  },
  {
    id: 'tone',
    icon: '⬛',
    title: 'التون ونص التون',
    screens: [
      {
        title: 'البيانو: أبيض وأسود',
        text: ['من أي مفتاح للي جنبه على طول (أبيض أو أسود) = نص تون.', 'ومن دو لـ ري = تون كامل (فيه مفتاح أسود في النص).'],
        keyboard: [0, 1, 2],
        examples: [
          { label: 'نص تون: دو ← دو#', sound: { notes: [0, 1], dur: 0.9 } },
          { label: 'تون: دو ← ري', sound: { notes: [0, 2], dur: 0.9 } },
        ],
      },
      {
        title: 'مكانين من غير مفتاح أسود',
        text: ['بين مي وفا، وبين سي ودو، مفيش مفتاح أسود — عشان كده المسافة نص تون بس.'],
        keyboard: [4, 5, 11, 12],
        examples: [
          { label: 'مي ← فا (نص تون)', sound: { notes: [4, 5], dur: 0.9 } },
          { label: 'سي ← دو (نص تون)', sound: { notes: [11, 12], dur: 0.9 } },
        ],
      },
    ],
    quiz: [
      { q: 'تون ولا نص تون؟', sound: { notes: [0, 2] }, options: ['تون', 'نص تون'], answer: 0 },
      { q: 'تون ولا نص تون؟', sound: { notes: [4, 5] }, options: ['تون', 'نص تون'], answer: 1 },
      { q: 'تون ولا نص تون؟', sound: { notes: [9, 11] }, options: ['تون', 'نص تون'], answer: 0 },
      { q: 'بين «مي» و«فا»:', options: ['تون', 'نص تون'], answer: 1 },
      { q: 'التون = كام نص تون؟', options: ['٢', '٤'], answer: 0 },
    ],
  },
  {
    id: 'scale',
    icon: '🌈',
    title: 'السلم: ماجير ومينور',
    screens: [
      {
        title: 'الفرحان والحزين',
        text: ['السلم = نغمات ورا بعض بترتيب معين.', 'الماجير صوته فرحان ومنوّر، والمينور صوته حزين أو جدّي.'],
        examples: [
          { label: 'ماجير (دو ماجير)', sound: { notes: MAJOR, dur: 0.5 } },
          { label: 'مينور (دو مينور)', sound: { notes: MINOR, dur: 0.5 } },
        ],
      },
      {
        title: 'النغمة التالتة بتفرق',
        text: ['في الماجير التالتة «مي»، وفي المينور «مي بيمول» (نص تون أوطى). النغمة دي لوحدها بتغيّر الإحساس.'],
        keyboard: [0, 3, 4, 7],
        examples: [
          { label: 'دو مي صول (ماجير)', sound: { notes: [0, 4, 7], dur: 0.8 } },
          { label: 'دو مي♭ صول (مينور)', sound: { notes: [0, 3, 7], dur: 0.8 } },
        ],
      },
    ],
    quiz: [
      { q: 'ماجير ولا مينور؟', sound: { notes: MAJOR, dur: 0.45 }, options: ['ماجير', 'مينور'], answer: 0 },
      { q: 'ماجير ولا مينور؟', sound: { notes: MINOR, dur: 0.45 }, options: ['ماجير', 'مينور'], answer: 1 },
      { q: 'ماجير ولا مينور؟', sound: { notes: [0, 3, 7], dur: 0.8 }, options: ['ماجير', 'مينور'], answer: 1 },
      { q: 'ماجير ولا مينور؟', sound: { notes: [0, 4, 7], dur: 0.8 }, options: ['ماجير', 'مينور'], answer: 0 },
      { q: 'الماجير إحساسه غالبًا:', options: ['فرحان', 'حزين'], answer: 0 },
    ],
  },
  {
    id: 'quarter',
    icon: '🎯',
    title: 'الربع تون',
    screens: [
      {
        title: 'نغمة بين نغمتين',
        text: ['البيانو فيه نغمات بس، لكن الموسيقى العربي فيها نغمات «بين» مفتاحين: الربع تون (نص النص تون).', 'اسمعي: مي، وبعدين مي نص بيمول (ربع تون أوطى)، وبعدين مي بيمول (نص تون أوطى).'],
        keyboard: [3, 4],
        examples: [{ label: 'مي ← مي نص بيمول ← مي بيمول', sound: { notes: [4, 3.5, 3], dur: 1 } }],
      },
      {
        title: 'طعم الشرق',
        text: ['مي نص بيمول دي اللي بتدّي الراست والبياتي طعمهم الشرقي.', 'البيانو مايقدرش يعزفها، بس التطبيق بيعزفها مظبوط.'],
        examples: [
          { label: 'دو ري مي فا (ماجير)', sound: { notes: [0, 2, 4, 5], dur: 0.7 } },
          { label: 'دو ري مي½♭ فا (راست)', sound: { notes: [0, 2, 3.5, 5], dur: 0.7 } },
        ],
      },
    ],
    quiz: [
      { q: 'النغمة التانية أوطى بـ:', sound: { notes: [4, 3.5], dur: 1 }, options: ['ربع تون', 'نص تون'], answer: 0 },
      { q: 'النغمة التانية أوطى بـ:', sound: { notes: [4, 3], dur: 1 }, options: ['ربع تون', 'نص تون'], answer: 1 },
      { q: 'الربع تون موجود على مفاتيح البيانو؟', options: ['لأ', 'أيوه'], answer: 0 },
      { q: '«مي نص بيمول» بين:', options: ['مي بيمول ومي', 'دو وري'], answer: 0 },
      { q: 'ده ماجير ولا شرقي (فيه ربع تون)؟', sound: { notes: [0, 2, 3.5, 5], dur: 0.7 }, options: ['ماجير', 'شرقي'], answer: 1 },
    ],
  },
  {
    id: 'maqam',
    icon: '🎼',
    title: 'يعني إيه مقام؟',
    screens: [
      {
        title: 'المقام = سلم + شخصية',
        text: ['المقام ترتيب نغمات معين (زي السلم)، ومعاه إحساس وطريقة سير للحن.', 'أشهر ستة: عجم، نهاوند، راست، بياتي، حجاز، صبا.'],
        examples: [
          { label: 'عجم — فرحان زي الماجير', sound: scale('ajam') },
          { label: 'نهاوند — عاطفي وحزين، قريب من المينور', sound: scale('nahawand') },
          { label: 'راست — "أبو المقامات": فخم ومتزن (فيه ربع تون)', sound: scale('rast') },
        ],
      },
      {
        title: 'ثلاثة كمان',
        text: ['كل مقام ليه "طعم". مع الوقت الودن بتعرفه من أول كام نغمة.'],
        examples: [
          { label: 'بياتي — دافي وشعبي، مشهور جدًا في مصر', sound: scale('bayati') },
          { label: 'حجاز — روحاني، فيه قفزة مميزة، مشهور في الأذان والإنشاد', sound: scale('hijaz') },
          { label: 'صبا — حزين جدًا ومؤثر', sound: scale('saba') },
        ],
      },
    ],
    quiz: [
      { q: 'ده عجم ولا صبا؟', sound: scale('ajam'), options: ['عجم', 'صبا'], answer: 0 },
      { q: 'ده عجم ولا صبا؟', sound: scale('saba'), options: ['عجم', 'صبا'], answer: 1 },
      { q: 'ده نهاوند ولا حجاز؟', sound: scale('nahawand'), options: ['نهاوند', 'حجاز'], answer: 0 },
      { q: 'مقام الراست فيه:', options: ['ربع تون', 'مفيش ربع تون'], answer: 0 },
      { q: 'المقام يعني:', options: ['سلم + إحساس وطريقة سير', 'اسم أغنية'], answer: 0 },
    ],
  },
  {
    id: 'cents',
    icon: '📏',
    title: 'السنت والمؤشر',
    screens: [
      {
        title: 'السنت',
        text: ['السنت = جزء صغير قوي من النغمة: النص تون = ١٠٠ سنت، والربع تون = ٥٠ سنت، والأوكتاف = ١٢٠٠ سنت.', 'لما التطبيق يقول «+15 سنت» يعني أعلى بحاجة صغيرة جدًا.'],
        examples: [
          { label: 'النغمة وبعدها +15 سنت', sound: { notes: [0, 0.15], dur: 1 } },
          { label: 'النغمة وبعدها +50 سنت (ربع تون)', sound: { notes: [0, 0.5], dur: 1 } },
        ],
      },
      {
        title: 'قراية المؤشر',
        text: ['النص الأخضر = مظبوط. الإبرة على الشمال = أوطى، على اليمين = أعلى.', 'في حدود ±٢٠ سنت = برافو. وأكتر من ١٠٠ سنت = نغمة تانية خالص.'],
        meter: [15, -40],
        examples: [],
      },
    ],
    quiz: [
      { q: '«+30 سنت» يعني:', options: ['أعلى شوية', 'أوطى شوية'], answer: 0 },
      { q: 'النص تون = كام سنت؟', options: ['٥٠', '١٠٠', '١٢٠٠'], answer: 1 },
      { q: 'الإبرة على الشمال يعني:', options: ['أوطى', 'أعلى'], answer: 0 },
      { q: '«-10 سنت» يعني:', options: ['قريب جدًا من المظبوط', 'بعيد خالص'], answer: 0 },
      { q: 'الأوكتاف = كام سنت؟', options: ['١٢٠٠', '١٠٠'], answer: 0 },
    ],
  },
  {
    id: 'tune',
    icon: '🎯',
    title: 'إزاي مبقاش نشاز؟',
    screens: [
      {
        title: 'نشاز ولا برا السلم؟',
        text: [
          'نشاز (out of tune) = النغمة أعلى أو أوطى شوية من المظبوطة — زي "مي" بس مايلة.',
          'برا السلم (out of scale) = نغمة صح في نفسها، بس مش من نغمات الأغنية — زي ما تقولي كلمة صح في جملة غلط.',
        ],
        examples: [
          { label: 'مي مظبوطة', sound: { notes: [4], dur: 1 } },
          { label: 'مي نشاز (أعلى ٣٠ سنت)', sound: { notes: [4.3], dur: 1 } },
          { label: 'دو ري مي فا — وبعدين فا# (برا سلم دو ماجير)', sound: { notes: [0, 2, 4, 5, 6], dur: 0.6 } },
        ],
      },
      {
        title: 'نصايح عملية',
        text: [
          '١. اسمعي قبل ما تغني — النغمة لازم تبقى في ودنك الأول.',
          '٢. همهمي «مممم» الأول بهدوء، وبعدين افتحي الصوت.',
          '٣. ابدئي بصوت واطي وهادي — الصوت العالي بيخلّي النشاز أسهل.',
          '٤. ادخلي على النغمة بزحلقة صغيرة لحد ما تحسيها مظبوطة.',
          '٥. استخدمي المؤشر: النص الأخضر = مظبوط.',
          '٦. الحتة الصعبة: كرريها لوحدها ببطء (تكرار الجملة، سرعة ٧٥٪).',
          '٧. تدريب الودن (مستوى ١ و٢) بيخلّي الودن تسمع الفرق الصغير.',
          '٨. سجّلي نفسك وقارني بالأغنية — الودن بتتعلم من المقارنة.',
        ],
        examples: [],
        links: [
          { href: '#/findnote', label: '🪜 إزاي أجيب دو صح؟' },
          { href: '#/match', label: '🎯 مطابقة النغمة' },
          { href: '#/ear', label: '👂 تدريب الودن' },
          { href: '#/sing', label: '🎵 غني مع الأغنية + 🔁 تكرار الجملة' },
        ],
      },
    ],
    quiz: [
      { q: 'النغمة دي مظبوطة ولا نشاز؟', sound: { notes: [4, 4.35], dur: 1 }, options: ['التانية نشاز', 'الاتنين زي بعض'], answer: 0 },
      { q: '"برا السلم" يعني:', options: ['نغمة مش من نغمات الأغنية', 'صوت عالي'], answer: 0 },
      { q: 'قبل ما تغني نغمة جديدة، أحسن حاجة:', options: ['تسمعيها وتهمهميها الأول', 'تغنيها بصوت عالي على طول'], answer: 0 },
      { q: 'الحتة الصعبة في الأغنية:', options: ['أكررها لوحدها ببطء', 'أعدّي عليها بسرعة'], answer: 0 },
      { q: 'الصوت الهادي بيخلّي النشاز:', options: ['أقل', 'أكتر'], answer: 0 },
    ],
  },
  {
    id: 'rhythm',
    icon: '🥁',
    title: 'الإيقاع: الضربة والسرعة والمازورة',
    screens: [
      {
        title: 'الضربة (النبض)',
        text: [
          'كل أغنية ليها نبض ثابت زي دقات القلب — ده اللي بتخبطي عليه برجلك من غير ما تحسي.',
          'الضربة دي ثابتة: مش بتسرع ولا بتبطّأ في نص الأغنية.',
        ],
        examples: [{ label: 'ضربات ثابتة', sound: { clicks: { bpm: 80, beats: [0, 1, 2, 3, 4, 5, 6, 7], perBar: 100 } } }],
      },
      {
        title: 'السرعة (التيمبو)',
        text: ['السرعة = عدد الضربات في الدقيقة. ٦٠ يعني ضربة كل ثانية، و١٢٠ يعني ضربتين في الثانية.', 'الترانيم الهادية غالبًا ٦٠–٨٠، والفرايحي ١٢٠ وأكتر.'],
        examples: [
          { label: 'بطيء (٦٠)', sound: { clicks: { bpm: 60, beats: [0, 1, 2, 3], perBar: 100 } } },
          { label: 'سريع (١٢٠)', sound: { clicks: { bpm: 120, beats: [0, 1, 2, 3, 4, 5, 6, 7], perBar: 100 } } },
        ],
      },
      {
        title: 'المازورة',
        text: [
          'الضربات بتتقسم مجموعات: كل مجموعة اسمها مازورة، وأول ضربة فيها أقوى.',
          'أغلب الأغاني: ٤ في المازورة (١ ٢ ٣ ٤). الفالس: ٣ (١ ٢ ٣).',
          'الرموز: ♩ ضربة في العدّة، ♫ ضربتين في العدّة، 𝄽 سكتة.',
        ],
        examples: [
          { label: '١ ٢ ٣ ٤', sound: { clicks: { bpm: 90, beats: [0, 1, 2, 3, 4, 5, 6, 7], perBar: 4 } } },
          { label: '١ ٢ ٣ (فالس)', sound: { clicks: { bpm: 100, beats: [0, 1, 2, 3, 4, 5], perBar: 3 } } },
        ],
        links: [{ href: '#/rhythm', label: '🥁 الإيقاع' }],
      },
    ],
    quiz: [
      { q: 'أنهي أسرع؟', sound: { clicks: { bpm: 70, beats: [0, 1, 2, 3, 4.2, 4.6, 5, 5.4, 5.8, 6.2], perBar: 100 } }, options: ['التانية', 'الأولانية'], answer: 0 },
      { q: 'سرعة ٦٠ يعني:', options: ['ضربة كل ثانية', '٦٠ ضربة في الثانية'], answer: 0 },
      { q: 'أول ضربة في المازورة:', options: ['أقوى من الباقي', 'أضعف من الباقي'], answer: 0 },
      { q: 'الرمز 𝄽 معناه:', options: ['سكتة', 'ضربتين'], answer: 0 },
    ],
  },
];

export const lessonById = (id: string) => LESSONS.find((l) => l.id === id);

/** Semitone offsets (from C) a sound plays; maqam scales come from the maqam table (cents → semitones). */
export function soundOffsets(s: Sound): number[] {
  if (s.maqam) return (MAQAMAT.find((m) => m.id === s.maqam)?.up ?? []).map((c) => c / 100);
  return s.notes ?? [];
}

/** Frequencies of a sound from a base C (MIDI) — quarter tones exact. */
export function soundFreqs(s: Sound, baseMidi: number): number[] {
  return soundOffsets(s).map((o) => 440 * Math.pow(2, (baseMidi + o - 69) / 12));
}

/** Number of right answers. */
export function scoreQuiz(quiz: QuizQuestion[], answers: (number | null)[]): number {
  return quiz.filter((q, i) => answers[i] === q.answer).length;
}

export function quizPassed(right: number, total: number): boolean {
  return total > 0 && right >= Math.ceil(total * PASS_RATIO);
}

/**
 * Today's lesson in the beginner path: the first lesson not passed yet, one per day
 * (none if a lesson was already passed today, or all are done).
 */
export function todaysLesson(done: Record<string, string>, today: string): LessonId | null {
  if (Object.values(done).includes(today)) return null;
  return LESSONS.find((l) => !done[l.id])?.id ?? null;
}
