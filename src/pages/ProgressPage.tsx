import { useState } from 'react';
import { g } from '../lib/gender';
import { Page } from '../components/ui';
import { clearAll, getResults, type ResultType } from '../lib/storage';
import { dailyBest, RESULT_INFO } from '../lib/progress';
import { WeeklyLines } from '../components/WeeklyLines';

const DAYS_SHOWN = 14;

export function ProgressPage() {
  const [results, setResults] = useState(getResults);
  const types = (Object.keys(RESULT_INFO) as ResultType[]).filter((t) => results.some((r) => r.type === t));

  const reset = () => {
    if (window.confirm(g('متأكدة إنك عايزة تمسحي كل النتايج؟', 'متأكد إنك عايز تمسح كل النتايج؟'))) {
      clearAll();
      setResults([]);
    }
  };

  return (
    <Page help="progress" title="التقدم" intro="أحسن نتيجة في كل يوم لكل تمرين (آخر أسبوعين).">
      <WeeklyLines />
      {!types.length && <p className="hint">لسه مفيش نتايج. ابدئي أي تمرين وهتلاقي تقدمك هنا.</p>}
      {types.map((type) => {
        const info = RESULT_INFO[type];
        const days = dailyBest(results, type).slice(-DAYS_SHOWN);
        const max = Math.max(...days.map((d) => d.best), 1);
        return (
          <div key={type} className="panel">
            <h2>{info.ar}</h2>
            <p className="hint">{info.higherIsBetter ? 'كل ما العمود يطول أحسن' : 'كل ما الرقم يصغر أحسن'}</p>
            <div className="chart" role="img" aria-label={info.ar}>
              {days.map((d) => (
                <div key={d.date} className="chart-col" title={`${d.date}: ${d.best} ${info.unit} (${d.count} مرة)`}>
                  <span className="chart-value">{d.best}</span>
                  <div className="chart-track">
                    <div className="chart-bar" style={{ height: `${Math.max(4, (d.best / max) * 100)}%` }} />
                  </div>
                  <span className="chart-day" dir="ltr">
                    {d.date.slice(5)}
                  </span>
                </div>
              ))}
            </div>
            <p className="hint">الوحدة: {info.unit}</p>
          </div>
        );
      })}
      {types.length > 0 && (
        <button className="link danger" onClick={reset}>
          مسح كل النتايج
        </button>
      )}
      <a className="list-row" href="#/more">
        <span>💾 نسخة من بياناتك (صدّري / استرجعي)</span>
        <span className="chev" aria-hidden>‹</span>
      </a>
    </Page>
  );
}
