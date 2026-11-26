// "أول مرة هنا؟": the first time she opens an exercise, 2–3 short bubbles, one at a time. Shown once per screen
// (a pref, so it follows her account); the ❓ popup can show them again.

import { useEffect, useState } from 'react';
import { WALKS } from '../content/walkthrough';
import type { HelpKey } from '../content/help';
import { getPref, setPref } from '../lib/storage';
import { arDigits } from './ActivityBadge';
import { g } from '../lib/gender';

export const WALK_EVENT = 'soty-walk';

/** Shows the bubbles again (from the ❓ popup). */
export function replayWalk(id: HelpKey) {
  setPref('walk.' + id, '');
  window.dispatchEvent(new CustomEvent(WALK_EVENT, { detail: id }));
}

export function Walkthrough({ id }: { id: HelpKey }) {
  const steps = WALKS[id];
  const [i, setI] = useState(() => (getPref('walk.' + id) === '1' ? -1 : 0));
  useEffect(() => {
    const again = (e: Event) => (e as CustomEvent<string>).detail === id && setI(0);
    window.addEventListener(WALK_EVENT, again);
    return () => window.removeEventListener(WALK_EVENT, again);
  }, [id]);
  if (!steps || i < 0) return null;
  const done = () => {
    setPref('walk.' + id, '1');
    setI(-1);
  };
  const last = i === steps.length - 1;
  return (
    <div className="walk" role="note" aria-label="أول مرة هنا؟">
      <p className="walk-count">
        أول مرة هنا؟ {arDigits(i + 1)} من {arDigits(steps.length)}
      </p>
      <p className="walk-text">{steps[i]}</p>
      <div className="row">
        <button className="primary" onClick={last ? done : () => setI(i + 1)}>
          {last ? 'فهمت ✔' : 'الجاية ←'}
        </button>
        {!last && (
          <button className="link" onClick={done}>
            {g('مش محتاجة شرح', 'مش محتاج شرح')}
          </button>
        )}
      </div>
    </div>
  );
}
