// Friendly note when the user keeps singing exactly an octave below/above the target (common when a man
// follows a note meant for a woman's range, or the reverse) instead of failing silently.

import { g } from '../lib/gender';
import { octaveHint } from '../lib/voice';

export function OctaveHint({ rawCents, fromTest }: { rawCents: number[]; fromTest: boolean }) {
  const h = octaveHint(rawCents);
  if (!h) return null;
  const fix = fromTest ? (
    <>
      {g('جربي النغمة في نفس الطبقة اللي سمعتيها.', 'جرب النغمة في نفس الطبقة اللي سمعتها.')}
    </>
  ) : (
    <>
      <a href="#/range">📏 اختبار المساحة الصوتية</a> {g('بيظبط كل النغمات على صوتك.', 'بيظبط كل النغمات على صوتك.')}
    </>
  );
  return (
    <p className="notes octave-hint" role="status">
      {h === 'below'
        ? g('إنتي بتغني أوطى بأوكتاف — ده طبيعي لو صوتك تقيل أو النغمة عالية عليكي. ', 'إنت بتغني أوطى بأوكتاف — ده طبيعي لصوت الرجالة، هنظبط النغمات على صوتك. ')
        : g('إنتي بتغني أعلى بأوكتاف — ده طبيعي لو النغمة واطية عليكي. ', 'إنت بتغني أعلى بأوكتاف (يمكن بالصوت المستعار) — هنظبط النغمات على صوتك. ')}
      {fix}
    </p>
  );
}
