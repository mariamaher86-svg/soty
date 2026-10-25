import { getRange } from '../lib/storage';
import { comfortableRange, defaultRange } from '../lib/voice';
import { g, getGender } from '../lib/gender';

/** Comfortable note range for exercises (from the saved range test, or a default). */
export function exerciseRange(): { low: number; high: number; fromTest: boolean } {
  const r = getRange();
  if (!r) return { ...defaultRange(getGender()), fromTest: false };
  return { ...comfortableRange(r.low, r.high), fromTest: true };
}

export const NO_RANGE_HINT = `لسه معملتيش اختبار المساحة الصوتية، فهنستخدم نغمات مريحة ${g('لأغلب أصوات البنات والستات', 'لأغلب أصوات الولاد والرجالة')}. اعمليه الأول عشان النغمات تبقى على قد صوتك بالظبط.`;
