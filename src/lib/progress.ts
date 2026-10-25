// Turning saved results into a per-day summary.

import type { Result, ResultType } from './storage';

export const RESULT_INFO: Record<ResultType, { ar: string; unit: string; higherIsBetter: boolean }> = {
  range: { ar: 'المساحة الصوتية', unit: 'نصف تون', higherIsBetter: true },
  match: { ar: 'مطابقة النغمة', unit: '%', higherIsBetter: true },
  maqam: { ar: 'المقامات', unit: '%', higherIsBetter: true },
  sustain: { ar: 'طول النفس', unit: 'ثانية', higherIsBetter: true },
  stability: { ar: 'ثبات الصوت (اهتزاز)', unit: 'سنت', higherIsBetter: false },
  hiss: { ar: 'تمرين سسسس', unit: 'ثانية', higherIsBetter: true },
  singalong: { ar: 'الغنا مع الأغنية', unit: '%', higherIsBetter: true },
  scale: { ar: 'يوتيوب — جوه السلم', unit: '%', higherIsBetter: true },
  'ear-pitch': { ar: 'الودن ١ — أعلى ولا أوطى', unit: '%', higherIsBetter: true },
  'ear-same': { ar: 'الودن ٢ — زي بعض ولا لأ', unit: '%', higherIsBetter: true },
  'ear-interval': { ar: 'الودن ٣ — المسافات', unit: '%', higherIsBetter: true },
  'ear-maqam': { ar: 'الودن ٤ — أنهي مقام', unit: '%', higherIsBetter: true },
  intervals: { ar: 'غنا الفواصل', unit: '%', higherIsBetter: true },
  loop: { ar: 'تكرار الجملة الصعبة (آخر تكرار)', unit: '%', higherIsBetter: true },
  vocalise: { ar: 'تمارين الصوت (فوكاليز)', unit: '%', higherIsBetter: true },
  findnote: { ar: 'إزاي أجيب دو صح (نغمات اتلقت)', unit: 'نغمة', higherIsBetter: true },
  phrase: { ar: 'تعلم الأغنية جملة جملة', unit: '%', higherIsBetter: true },
  rhythm: { ar: 'الإيقاع', unit: '%', higherIsBetter: true },
  game: { ar: 'لعبة الصوت', unit: 'نقطة', higherIsBetter: true },
  dynamics: { ar: 'العالي والواطي', unit: '%', higherIsBetter: true },
  piano: { ar: 'البيانو (نغمات مظبوطة)', unit: '%', higherIsBetter: true },
};

export interface DaySummary {
  date: string;
  best: number;
  count: number;
}

/** Best value per day for one result type, oldest day first. */
export function dailyBest(results: Result[], type: ResultType): DaySummary[] {
  const higher = RESULT_INFO[type].higherIsBetter;
  const byDay = new Map<string, DaySummary>();
  for (const r of results) {
    if (r.type !== type) continue;
    const d = byDay.get(r.date);
    if (!d) byDay.set(r.date, { date: r.date, best: r.value, count: 1 });
    else {
      d.count++;
      d.best = higher ? Math.max(d.best, r.value) : Math.min(d.best, r.value);
    }
  }
  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
}
