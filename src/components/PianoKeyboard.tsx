// The whole piano (C2–C7), always on screen: a big label, a mini-map of all the keys, and the keys themselves in their
// own horizontal scroller (the page never scrolls sideways). It stays stuck under the top bar, so it must be a direct
// child of the page. Low notes on the left like a real piano, even though the app is right-to-left.
// While she sings only the key she's hitting changes (directly on the DOM): the 61 keys aren't re-rendered for it.

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { chosenLabel, keyboardLayout, keyFraction, keyNames, keyX, miniFrame, MIDDLE_C, sameNameKeys, scrollForFraction, scrollToKeep, WHITE_COUNT, type LabelStyle, type Quarter } from '../lib/keyboard';
import { quarterToneName } from '../lib/music';

const LAYOUT = keyboardLayout();
const QUARTER_MARK: Record<string, string> = { '-0.5': '½♭', '0.5': '½♯' };
/** Scroller padding on each side (the --s4 gutter). */
const PAD = 16;
const OCTAVES = LAYOUT.keys.filter((k) => k.midi % 12 === 0);

interface KeysProps {
  target: number | null;
  quarter: Quarter;
  same: Set<number>;
  /** keys marked ½♭ besides the target: the quarter tones of a scale shown in a lesson */
  halfFlats: Set<number>;
  low: number;
  high: number;
  labels: LabelStyle;
  width: number;
  onKey: (midi: number) => void;
}

/** All the keys. Redrawn only when the choice changes, never for a live reading. */
const Keys = memo(function Keys({ target, quarter, same, halfFlats, low, high, labels, width, onKey }: KeysProps) {
  return (
    <div className="piano" style={{ width: LAYOUT.whites * width }} role="group" aria-label="البيانو">
      <div className="piano-ruler" aria-hidden>
        {OCTAVES.map((k) => (
          <span key={k.midi} style={{ left: k.x * width }}>
            {keyNames(k.midi).letter}
          </span>
        ))}
      </div>
      {LAYOUT.keys.map((k) => {
        const n = keyNames(k.midi);
        const cls = ['pkey', k.black ? 'black' : 'white', k.midi % 12 === 0 ? 'octave-start' : '', k.midi >= low && k.midi <= high ? 'comfort' : '', same.has(k.midi) ? 'same' : '', k.midi === target ? 'target' : ''].filter(Boolean).join(' ');
        return (
          <button key={k.midi} data-midi={k.midi} className={cls} style={{ left: k.x * width, width: k.w * width }} onClick={() => onKey(k.midi)} aria-label={`${n.solfege} ${n.letter}${n.flat ? ` ${n.flat}` : ''}`} aria-pressed={k.midi === target}>
            {k.midi === MIDDLE_C && <span className="pkey-mid" title="دو الوسطانية (C4)" />}
            {k.midi === target && quarter !== 0 ? <span className="pkey-quarter">{QUARTER_MARK[String(quarter)]}</span> : halfFlats.has(k.midi) && <span className="pkey-quarter">½♭</span>}
            {k.black ? (
              <span className="pkey-name" dir="ltr">
                <small>{n.letter}</small>
                <small>{n.flat}</small>
              </span>
            ) : labels === 'solfege' ? (
              <span className="pkey-name">
                {n.solfege}
                <small dir="ltr">{n.letter}</small>
              </span>
            ) : (
              <span className="pkey-name">
                <span dir="ltr">{n.letter}</span>
                {labels === 'both' && <small>{n.solfege}</small>}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
});

/** The drawing of the whole keyboard in miniature: it never changes. */
const MINI_KEYS = (
  <>
    {LAYOUT.keys
      .filter((k) => k.black)
      .map((k) => (
        <i key={k.midi} className="mini-black" style={{ left: `${(k.x / WHITE_COUNT) * 100}%`, width: `${(k.w / WHITE_COUNT) * 100}%` }} />
      ))}
    {OCTAVES.map((k) => (
      <span key={k.midi} className="mini-octave" style={{ left: `${(k.x / WHITE_COUNT) * 100}%` }}>
        {keyNames(k.midi).letter}
      </span>
    ))}
  </>
);

export function PianoKeyboard({
  target,
  quarter,
  hit,
  comfort,
  labels,
  zoom,
  onKey,
  caption,
  showSame = false,
  onToggleSame,
  inline = false,
  highlight,
  halfFlats,
}: {
  target: number | null;
  quarter: Quarter;
  /** the key she is singing right now */
  hit: number | null;
  comfort: { low: number; high: number };
  labels: LabelStyle;
  zoom: boolean;
  onKey: (midi: number) => void;
  /** replaces the chosen note's big label (e.g. the syllable in a vocalise, or a prompt) */
  caption?: ReactNode;
  showSame?: boolean;
  /** given = offer "ورّيني كل المي" */
  onToggleSame?: () => void;
  /** inside a lesson: just the keys, no big label or mini-map */
  inline?: boolean;
  /** keys lit up together (a scale, an interval) */
  highlight?: number[];
  halfFlats?: number[];
}) {
  const box = useRef<HTMLDivElement | null>(null);
  const frame = useRef<HTMLDivElement | null>(null);
  const voiceDot = useRef<HTMLElement | null>(null);
  const width = zoom ? 74 : 46; // px per white key (≥ 44 to tap; zoomed, black keys are 44 too)
  const keysWidth = WHITE_COUNT * width;
  const targetRef = useRef(target);
  targetRef.current = target;

  const onKeyRef = useRef(onKey);
  onKeyRef.current = onKey;
  const stableKey = useCallback((m: number) => onKeyRef.current(m), []);

  const same = useMemo(() => new Set([...(showSame && target !== null ? sameNameKeys(target) : []), ...(highlight ?? [])]), [showSame, target, highlight]);
  const flats = useMemo(() => new Set(halfFlats ?? []), [halfFlats]);

  const updateFrame = useCallback(() => {
    const el = box.current;
    const f = frame.current;
    if (!el || !f) return;
    const r = miniFrame(el.scrollLeft, el.clientWidth, WHITE_COUNT * (zoomRef.current ? 74 : 46), PAD);
    f.style.left = `${r.left * 100}%`;
    f.style.width = `${r.width * 100}%`;
  }, []);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  const go = (left: number, smooth = true) => {
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    box.current?.scrollTo({ left, behavior: smooth && !reduced ? 'smooth' : 'auto' });
    if (!smooth || reduced) updateFrame();
  };

  // open at the chosen note, or at her comfortable range; same after zooming
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.scrollLeft = targetRef.current !== null ? scrollForFraction(keyFraction(targetRef.current), el.clientWidth, keysWidth, PAD) : Math.max(0, keyX(comfort.low) * width + PAD - 8);
    updateFrame();
  }, [width, comfort.low]);

  useEffect(() => {
    window.addEventListener('resize', updateFrame);
    return () => window.removeEventListener('resize', updateFrame);
  }, []);

  // a note chosen from elsewhere (her own octave, the next vocalise note) must be on screen
  useEffect(() => {
    const el = box.current;
    if (!el || target === null) return;
    const x = keyX(target) * width;
    const next = scrollToKeep(x, null, width, el.scrollLeft, el.clientWidth, PAD);
    if (next !== null) go(next);
  }, [target, width]);

  // the key she's singing: lit directly (no re-render of the keys), and scrolled to only if needed
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.querySelectorAll('.pkey.hit, .pkey.hit-target').forEach((k) => k.classList.remove('hit', 'hit-target'));
    if (voiceDot.current) voiceDot.current.style.display = hit === null ? 'none' : 'block';
    if (hit === null) return;
    el.querySelector(`[data-midi="${hit}"]`)?.classList.add(hit === target ? 'hit-target' : 'hit');
    if (voiceDot.current) voiceDot.current.style.left = `${keyFraction(hit) * 100}%`;
    const next = scrollToKeep(keyX(hit) * width, target === null ? null : keyX(target) * width, width, el.scrollLeft, el.clientWidth, PAD);
    if (next !== null) go(next);
  }, [hit, target, width, labels, showSame]);

  // what a lesson lit up must be on screen, centred
  useEffect(() => {
    const el = box.current;
    if (!el || !highlight?.length) return;
    const middle = (keyX(Math.min(...highlight)) + keyX(Math.max(...highlight))) / 2;
    go(Math.max(0, middle * width + PAD - el.clientWidth / 2 + width / 2));
  }, [highlight, width]);

  // tap or drag on the mini-map: jump there
  const jump = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = box.current;
    if (!el) return;
    const r = e.currentTarget.getBoundingClientRect();
    go(scrollForFraction((e.clientX - r.left) / r.width, el.clientWidth, keysWidth, PAD), false);
  };

  const label = caption ?? (target === null ? <span className="hint">دوسي على أي مفتاح</span> : quarter !== 0 ? `${quarterToneName(target + quarter).ar} — ${quarterToneName(target + quarter).name}` : chosenLabel(target));

  return (
    <div className={inline ? 'piano-dock inline' : 'piano-dock'}>
      {!inline && (
        <>
      <div className="piano-now">
        <b className="piano-label" aria-live="polite">
          {label}
        </b>
        {onToggleSame && target !== null && (
          <button className={showSame ? 'chip active piano-same' : 'chip piano-same'} onClick={onToggleSame}>
            ورّيني كل ال{keyNames(target).solfege}
          </button>
        )}
      </div>
      <div
        className="mini-map"
        dir="ltr"
        role="slider"
        aria-label="خريطة البيانو كله: دوسي أو اسحبي عشان تروحي لأي أوكتاف"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={target === null ? 0 : Math.round(keyFraction(target) * 100)}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          jump(e);
        }}
        onPointerMove={(e) => e.buttons > 0 && jump(e)}
      >
        {MINI_KEYS}
        <div className="mini-frame" ref={frame} />
        {target !== null && <i className="mini-dot target" style={{ left: `${keyFraction(target) * 100}%` }} />}
        <i className="mini-dot voice" ref={voiceDot} style={{ display: 'none' }} />
      </div>
        </>
      )}
      <div className="piano-scroll" ref={box} dir="ltr" onScroll={updateFrame}>
        <Keys target={target} quarter={quarter} same={same} halfFlats={flats} low={comfort.low} high={comfort.high} labels={labels} width={width} onKey={stableKey} />
      </div>
    </div>
  );
}
