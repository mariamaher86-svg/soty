// The whole piano (C2–C7) as buttons, in its own horizontal scroller (the page never scrolls sideways).
// Low notes on the left like a real piano, even though the app is right-to-left.

import { useEffect, useRef } from 'react';
import { keyboardLayout, keyLabel, keyX, MIDDLE_C, type LabelStyle, type Quarter } from '../lib/keyboard';

const LAYOUT = keyboardLayout();
const QUARTER_MARK: Record<string, string> = { '-0.5': '½♭', '0.5': '½♯' };

export function PianoKeyboard({
  target,
  quarter,
  hit,
  comfort,
  labels,
  zoom,
  onKey,
}: {
  target: number | null;
  quarter: Quarter;
  /** the key she is singing right now */
  hit: number | null;
  comfort: { low: number; high: number };
  labels: LabelStyle;
  zoom: boolean;
  onKey: (midi: number) => void;
}) {
  const box = useRef<HTMLDivElement | null>(null);
  const width = zoom ? 74 : 46; // px per white key (≥ 44 to tap; zoomed, black keys are 44 too)

  // open at her comfortable range
  useEffect(() => {
    const el = box.current;
    if (el) el.scrollLeft = Math.max(0, keyX(comfort.low) * width - 8);
  }, [width, comfort.low]);

  // keep the key she's singing in view
  useEffect(() => {
    const el = box.current;
    if (!el || hit === null) return;
    const x = keyX(hit) * width;
    if (x < el.scrollLeft || x + width > el.scrollLeft + el.clientWidth) el.scrollTo({ left: Math.max(0, x - el.clientWidth / 2), behavior: 'smooth' });
  }, [hit, width]);

  return (
    <div className="piano-scroll" ref={box} dir="ltr">
      <div className="piano" style={{ width: LAYOUT.whites * width }} role="group" aria-label="البيانو">
        {LAYOUT.keys.map((k) => {
          const l = keyLabel(k.midi, labels);
          const cls = [
            'pkey',
            k.black ? 'black' : 'white',
            k.midi >= comfort.low && k.midi <= comfort.high ? 'comfort' : '',
            k.midi === target ? 'target' : '',
            k.midi === hit && k.midi !== target ? 'hit' : '',
            k.midi === hit && k.midi === target ? 'hit-target' : '',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <button
              key={k.midi}
              className={cls}
              style={{ left: k.x * width, width: k.w * width }}
              onClick={() => onKey(k.midi)}
              aria-label={`${keyLabel(k.midi, 'both').main} ${keyLabel(k.midi, 'letters').main}${l.octave}`}
              aria-pressed={k.midi === target}
            >
              {k.midi === MIDDLE_C && <span className="pkey-mid" title="دو الوسطانية (C4)" />}
              {k.midi === target && quarter !== 0 && <span className="pkey-quarter">{QUARTER_MARK[String(quarter)]}</span>}
              <span className="pkey-name">
                {l.main}
                {l.second && !k.black && <small>{l.second}</small>}
                <sub>{l.octave}</sub>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
