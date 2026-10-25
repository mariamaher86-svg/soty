// One clear status line for guided steps: 🔊 listen / 🎤 your turn / ✔ done.

import { useActivity } from '../lib/activity';

export function ActivityBadge({ done }: { done?: boolean }) {
  const a = useActivity();
  if (done) return <p className="activity done">✔ الخطوة دي خلصت</p>;
  if (a === 'listen') return <p className="activity listen">🔊 اسمعي…</p>;
  if (a === 'yourTurn') return <p className="activity turn">🎤 دورك — غني دلوقتي</p>;
  return <p className="activity idle">👇 ابدئي من الزرار تحت</p>;
}

/** 1 → ١ */
export const arDigits = (n: number | string) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);
