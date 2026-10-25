// "▶️ شوفي الطريقة على يوتيوب": a YouTube *search* per exercise (we can't vouch for specific videos),
// in Arabic and in English. Edit the queries here.

export interface VideoQuery {
  /** what the link is for (shown in car mode's list) */
  title: string;
  ar: string;
  en: string;
}

export const VIDEOS = {
  warmup: { title: 'الإحماء', ar: 'تمارين إحماء الصوت للغناء', en: 'vocal warm up exercises for beginners' },
  lipTrill: { title: 'ترعيش الشفايف "بررر"', ar: 'تمرين ترعيش الشفايف للصوت', en: 'lip trill singing exercise' },
  siren: { title: 'السيرينة', ar: 'تمرين السيرينة للصوت والغناء', en: 'vocal siren exercise' },
  humming: { title: 'الهمهمة "مممم"', ar: 'تمرين الهمهمة لتسخين الصوت', en: 'humming vocal warm up' },
  breathing: { title: 'التنفس من البطن', ar: 'تمرين التنفس للغناء من البطن', en: 'diaphragmatic breathing for singers' },
  sustain: { title: 'مد النغمة بثبات', ar: 'تمرين ثبات الصوت ومد النغمة للغناء', en: 'sustain a steady note singing exercise' },
  hiss: { title: 'تمرين سسسس', ar: 'تمرين الزفير سسس للمغنيين', en: 'hissing breath exercise for singers' },
  matchPitch: { title: 'مطابقة النغمة', ar: 'إزاي أغني النغمة صح للمبتدئين', en: 'pitch matching singing exercise beginner' },
  findNote: { title: 'مسك النغمة', ar: 'تعلم الغناء على النغمة الصحيحة للمبتدئين', en: 'how to match pitch singing for beginners' },
  ear: { title: 'تدريب الودن', ar: 'تدريب الأذن الموسيقية للمبتدئين', en: 'ear training for singers beginner' },
  intervals: { title: 'الفواصل الموسيقية', ar: 'تمارين غناء الأبعاد الموسيقية', en: 'singing intervals exercise' },
  maqam: { title: 'المقامات', ar: 'شرح المقامات الموسيقية العربية للغناء', en: 'arabic maqam scales singing' },
  doremi: { title: 'سلم دو ري مي', ar: 'تمرين دو ري مي فا صول للغناء', en: 'do re mi solfege singing exercise' },
  'vocalise-five': { title: 'سلم الخمس نغمات "آه"', ar: 'تمرين خمس نغمات آه لتسخين الصوت', en: '5 note scale vocal exercise' },
  'vocalise-arp': { title: 'أربيجيو "ما مي ما"', ar: 'تمرين أربيجيو للصوت ما مي ما', en: 'arpeggio vocal warm up ma me ma' },
  'vocalise-staccato': { title: 'ستاكاتو "ها ها ها"', ar: 'تمرين ستاكاتو ها ها لدعم النفس', en: 'staccato ha ha vocal exercise diaphragm' },
  'vocalise-nee': { title: '"ني ني ني"', ar: 'تمرين ني ني ني للصوت', en: 'nee nee nee vocal exercise' },
  'vocalise-octave': { title: 'زحلقة أوكتاف "وو"', ar: 'تمرين زحلقة الأوكتاف للصوت', en: 'octave slide vocal exercise' },
  cooldown: { title: 'تهدئة الصوت', ar: 'تمارين تهدئة الصوت بعد الغناء', en: 'vocal cool down exercises' },
} satisfies Record<string, VideoQuery>;

export type VideoKey = keyof typeof VIDEOS;

export function youtubeSearchUrl(query: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}
