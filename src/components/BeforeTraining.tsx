// "قبل ما تبدأي": iPhone sound/mic tips, compact, hideable, easy to reopen.

import { useState } from 'react';
import { getPref, setPref } from '../lib/storage';

export function BeforeTraining() {
  // open by itself only the very first time; after that it's one small chip
  const [open, setOpen] = useState(() => {
    const first = getPref('tips.hidden') === null;
    if (first) setPref('tips.hidden', '1');
    return first || getPref('tips.hidden') === '0';
  });
  const toggle = (o: boolean) => {
    setOpen(o);
    setPref('tips.hidden', o ? '0' : '1');
  };

  if (!open)
    return (
      <button className="tool-chip" onClick={() => toggle(true)}>
        📱 قبل ما تبدأي
      </button>
    );

  return (
    <div className="notes tips tools-wide" role="note">
      <div className="tips-head">
        <b>📱 قبل ما تبدأي (٣ حاجات)</b>
        <button className="tool-chip" onClick={() => toggle(false)} aria-label="إخفاء النصايح">
          إخفاء ✕
        </button>
      </div>
      <ol>
        <li>
          <b>اقفلي الوضع الصامت</b> (من زرار Action أو من Control Center) — على الآيفون الصامت بيكتم أصوات التطبيق (البيانو والكورال).
        </li>
        <li>
          لما الميكروفون يشتغل، الآيفون ممكن يوطّي الصوت أو يطلّعه من سماعة المكالمات — <b>علّي الصوت أو البسي سماعات</b>.
        </li>
        <li>
          في "غني مع الأغنية" ويوتيوب: <b>استخدمي سماعات EarPods بسلك (USB-C)</b>. الـ AirPods بتأخّر الصوت، والمايك بتاعها بيقلل جودة الصوت وانتي بتسجلي — لو مفيش غيرها استخدميها للسماع بس.
        </li>
      </ol>
    </div>
  );
}

/** "Add to Home Screen" note for iPhone (data safety). */
export function HomeScreenNote() {
  return (
    <div className="notes" role="note">
      <b>📲 على الآيفون:</b>
      <ul>
        <li>من Safari: زرار المشاركة ← "Add to Home Screen" (إضافة إلى الشاشة الرئيسية)، وافتحي التطبيق دايمًا من الأيقونة. Safari ممكن يمسح بيانات الموقع لو مفتحتيهوش حوالي أسبوع، لكن تطبيق الشاشة الرئيسية لأ.</li>
        <li>بيانات تطبيق الشاشة الرئيسية منفصلة عن بيانات Safari — انقليها بينهم بـ "صدّري" و"استرجعي".</li>
        <li>صدّري نسخة احتياطية كل فترة واحفظيها في Files أو iCloud Drive.</li>
      </ul>
    </div>
  );
}
