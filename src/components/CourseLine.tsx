// Progress page: the voice course over time — the day each level opened, as a rising line.

import { COURSE } from '../content/course';
import { ar, currentLevel, getCourse } from '../lib/course';
import { daysBetween } from '../lib/path';

export function CourseLine() {
  const p = getCourse();
  const pts = Object.entries(p.reached)
    .map(([n, date]) => ({ n: Number(n), date }))
    .sort((a, b) => a.n - b.n);
  if (!pts.length) return null;
  const W = 300;
  const H = 90;
  const first = pts[0].date;
  const span = Math.max(1, daysBetween(first, pts[pts.length - 1].date));
  const x = (d: string) => (pts.length === 1 ? W / 2 : 12 + (daysBetween(first, d) / span) * (W - 24));
  const y = (n: number) => H - 10 - ((n - 1) / (COURSE.length - 1)) * (H - 20);
  // steps: flat until the next level opens
  const line = pts.flatMap((pt, i) => (i ? [`${x(pt.date)},${y(pts[i - 1].n)}`, `${x(pt.date)},${y(pt.n)}`] : [`${x(pt.date)},${y(pt.n)}`])).join(' ');
  return (
    <div className="panel course-line">
      <h2>🎓 كورس الصوت — المستويات</h2>
      <p className="hint">
        دلوقتي: المستوى {ar(currentLevel(p))} من {ar(COURSE.length)}
        {p.graduated ? ' · 🎓 اتخرجتي' : ''}
      </p>
      <svg className="line-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="المستويات على الأيام">
        <polyline points={line} />
        {pts.map((pt) => (
          <circle key={pt.n} cx={x(pt.date)} cy={y(pt.n)} r={4}>
            <title>{`المستوى ${pt.n}: ${pt.date}`}</title>
          </circle>
        ))}
      </svg>
      <ul className="course-days">
        {pts.map((pt) => (
          <li key={pt.n}>
            المستوى {ar(pt.n)}: <span dir="ltr">{pt.date}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
