// "❓ كيفية الاستخدام": a button on every feature page that opens its how-to in a popup (✕, the backdrop or Esc closes it).

import { useEffect, useState } from 'react';
import { HELP, type HelpEntry, type HelpKey } from '../content/help';

/** The help body (also used by the guide page). */
export function HelpBody({ e }: { e: HelpEntry }) {
  return (
    <div className="help-body">
      <h3>بتعمل إيه</h3>
      <p>{e.what}</p>
      <h3>بتفيدك في إيه</h3>
      <p>{e.why}</p>
      <h3>إزاي</h3>
      <ol>
        {e.steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      <h3>الأرقام معناها إيه</h3>
      <ul>
        {e.numbers.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
      <h3>نصايح</h3>
      <ul>
        {e.tips.map((s) => (
          <li key={s}>{s}</li>
        ))}
        {e.sound && <li>قبل البداية: كارت «📱 قبل ما تبدأي» فيه ٣ حاجات مهمة (الصامت، الصوت، السماعات).</li>}
        {e.seeAlso && <li>وكمان: {e.seeAlso}</li>}
      </ul>
      <p className="hint">
        فيه كلمة مش واضحة؟ معناها في <a href="#/guide">📖 دليل الاستخدام</a>.
      </p>
    </div>
  );
}

export function Help({ id }: { id: HelpKey }) {
  const [open, setOpen] = useState(false);
  const e = HELP[id];
  useEffect(() => {
    if (!open) return;
    const onKey = (ev: KeyboardEvent) => ev.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  return (
    <>
      <button className="help-toggle" onClick={() => setOpen(true)}>
        ❓ كيفية الاستخدام
      </button>
      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true" aria-label={`شرح ${e.title}`} onClick={(ev) => ev.stopPropagation()}>
            <div className="modal-head">
              <h2>{e.title}</h2>
              <button className="icon-btn" onClick={() => setOpen(false)} aria-label="قفل الشرح">
                ✕
              </button>
            </div>
            <HelpBody e={e} />
            <button className="big primary" onClick={() => setOpen(false)}>
              تمام، فهمت
            </button>
          </div>
        </div>
      )}
    </>
  );
}
