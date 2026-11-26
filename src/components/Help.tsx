// "❓ كيفية الاستخدام": a button on every feature page that opens its how-to in a popup (✕, the backdrop or Esc closes it).

import { replayWalk } from './Walkthrough';
import { WALKS } from '../content/walkthrough';
import { useState } from 'react';
import { Dialog } from './Dialog';
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
  return (
    <>
      <button className="icon-btn help-toggle" onClick={() => setOpen(true)} aria-label="كيفية الاستخدام">
        ❓
      </button>
      {open && (
        <Dialog
          title={e.title}
          label={`شرح ${e.title}`}
          closeLabel="قفل الشرح"
          onClose={() => setOpen(false)}
          footer={
            <button className="big primary" onClick={() => setOpen(false)}>
              تمام، فهمت
            </button>
          }
        >
          {WALKS[id] && (
            <button
              className="link"
              onClick={() => {
                setOpen(false);
                replayWalk(id);
              }}
            >
              🔁 وريني الشرح السريع تاني
            </button>
          )}
          <HelpBody e={e} />
        </Dialog>
      )}
    </>
  );
}
