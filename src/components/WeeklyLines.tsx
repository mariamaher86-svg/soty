// Progress page: one small line per measure — the starting measurement, then every weekly check.

import { getPath } from '../lib/storage';
import { MEASURES, measureValue, usableMeasurements } from '../lib/path';

export function WeeklyLines() {
  const p = usableMeasurements(getPath()); // empty records (from skipped steps) are ignored
  if (!p.baseline) return null;
  const all = [p.baseline, ...p.weekly];
  return (
    <div className="panel">
      <h2>🌱 مسار المبتدئ — القياسات الأسبوعية</h2>
      <p className="hint">أول نقطة = قياس البداية (الخط المتقطع)، وبعدها كل أسبوع.</p>
      {MEASURES.map((m) => {
        const pts = all.map((x) => ({ date: x.date, v: measureValue(x, m.key) })).filter((x): x is { date: string; v: number } => x.v !== null);
        if (!pts.length) return null;
        const vs = pts.map((x) => x.v);
        const min = Math.min(...vs);
        const max = Math.max(...vs);
        const span = max - min || 1;
        const W = 300;
        const H = 70;
        const x = (i: number) => (pts.length === 1 ? W / 2 : 10 + (i / (pts.length - 1)) * (W - 20));
        const y = (v: number) => H - 10 - ((v - min) / span) * (H - 20);
        const last = pts[pts.length - 1].v;
        return (
          <div key={m.key} className="weekly-measure">
            <div>
              <b>{m.ar}</b>: {Math.round(pts[0].v * 10) / 10} ← {Math.round(last * 10) / 10} {m.unit}{' '}
              <small className="hint">({m.higherIsBetter ? 'الأعلى أحسن' : 'الأقل أحسن'})</small>
            </div>
            <svg className="line-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={m.ar}>
              <line className="base" x1={0} x2={W} y1={y(pts[0].v)} y2={y(pts[0].v)} />
              <polyline points={pts.map((pt, i) => `${x(i)},${y(pt.v)}`).join(' ')} />
              {pts.map((pt, i) => (
                <circle key={i} cx={x(i)} cy={y(pt.v)} r={4}>
                  <title>{`${pt.date}: ${pt.v}`}</title>
                </circle>
              ))}
            </svg>
          </div>
        );
      })}
    </div>
  );
}
