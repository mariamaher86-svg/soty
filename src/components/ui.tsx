// Small shared UI pieces.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { nearestNote, noteName, noteNameAr } from '../lib/music';
import { today } from '../lib/storage';
import { BeforeTraining } from './BeforeTraining';
import { Help } from './Help';
import { NoiseCheck } from './NoiseCheck';
import type { HelpKey } from '../content/help';

/** Inside the beginner path an exercise is shown without its own title (the path gives the instructions). */
export const EmbeddedContext = createContext(false);

/** Where secondary things go on an exercise page: the "⚙️ خيارات" sheet. Null = show them in place. */
const OptionsSlot = createContext<{ el: HTMLElement | null; register: () => () => void } | null>(null);

/** Puts its children in the page's "⚙️ خيارات" sheet (sound, speed, videos, lesson links…), or in place if there's none. */
export function InOptions({ children }: { children: ReactNode }) {
  const slot = useContext(OptionsSlot);
  useEffect(() => slot?.register(), [slot]);
  if (!slot) return <>{children}</>;
  return slot.el ? createPortal(children, slot.el) : null;
}

/**
 * One screen: a title, one short instruction line, the ❓ how-to and the ⚙️ options sheet; the page body is just the
 * exercise. `tips` = the iPhone sound tips, `mic` = the room-noise check, both inside the options sheet.
 */
export function Page({ title, intro, tips, mic, help, children }: { title: string; intro?: ReactNode; tips?: boolean; mic?: boolean; help?: HelpKey; children: ReactNode }) {
  const embedded = useContext(EmbeddedContext);
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const register = useCallback(() => {
    setCount((c) => c + 1);
    return () => setCount((c) => c - 1);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  const slot = useMemo(() => ({ el, register }), [el, register]);
  if (embedded) return <div className="embedded">{children}</div>;
  const hasOptions = tips || mic || count > 0;
  return (
    <OptionsSlot.Provider value={slot}>
      <section className="page">
        <header className="page-head">
          <h1>{title}</h1>
          <div className="page-actions">
            {help && <Help id={help} />}
            <button className="icon-btn options-toggle" hidden={!hasOptions} onClick={() => setOpen(true)} aria-label="خيارات" aria-expanded={open}>
              ⚙️
            </button>
          </div>
        </header>
        {intro && <p className="intro">{intro}</p>}
        {children}
        <div className="sheet-backdrop" hidden={!open} onClick={() => setOpen(false)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-label="خيارات" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <h2>خيارات</h2>
              <button className="icon-btn" onClick={() => setOpen(false)} aria-label="قفل الخيارات">
                ✕
              </button>
            </div>
            {(tips || mic) && (
              <div className="page-tools">
                {tips && <BeforeTraining />}
                {mic && <NoiseCheck />}
              </div>
            )}
            <div className="sheet-body" ref={setEl} />
            <button className="big primary" onClick={() => setOpen(false)}>
              تمام
            </button>
          </div>
        </div>
      </section>
    </OptionsSlot.Provider>
  );
}

/** "خيارات": secondary settings. On a page they go in its ⚙️ sheet; elsewhere they fold away in place. */
export function Options({ label = 'خيارات', children, open }: { label?: string; children: ReactNode; open?: boolean }) {
  const slot = useContext(OptionsSlot);
  if (slot)
    return (
      <InOptions>
        <section className="options-group">
          <h3>{label.replace(/^خيارات:?\s*/, '') || 'خيارات'}</h3>
          {children}
        </section>
      </InOptions>
    );
  return (
    <details className="options" open={open}>
      <summary>{label}</summary>
      <div className="options-body">{children}</div>
    </details>
  );
}

/** A result: one big number, the rest folded under "التفاصيل". */
export function Score({ value, label = 'النتيجة', children }: { value: ReactNode; label?: string; children?: ReactNode }) {
  return (
    <div className="score">
      <div className="score-value">{value}</div>
      <div className="score-label">{label}</div>
      {children && (
        <details className="score-details">
          <summary>التفاصيل</summary>
          {children}
        </details>
      )}
    </div>
  );
}

/** Horizontal meter: center = on target, left = lower (flat), right = higher (sharp). */
export function CentsMeter({ cents, tolerance = 20, range = 100 }: { cents: number | null; tolerance?: number; range?: number }) {
  const clamped = cents === null ? null : Math.max(-range, Math.min(range, cents));
  const pos = clamped === null ? 50 : 50 + (clamped / range) * 50;
  const ok = cents !== null && Math.abs(cents) <= tolerance;
  const zone = (tolerance / range) * 50;
  return (
    <div className="meter" dir="ltr" aria-label="مؤشر الانحراف بالسنت">
      <div className="meter-zone" style={{ left: `${50 - zone}%`, width: `${zone * 2}%` }} />
      <div className="meter-center" />
      {clamped !== null && <div className={'meter-needle' + (ok ? ' ok' : '')} style={{ left: `${pos}%` }} />}
      <div className="meter-labels">
        <span>أوطى ♭</span>
        <span>♯ أعلى</span>
      </div>
    </div>
  );
}

/** Live note readout: "A4 · لا 4". */
export function LiveNote({ freq }: { freq: number | null }) {
  if (!freq) return <div className="live-note muted">…غني</div>;
  const { midi } = nearestNote(freq);
  return (
    <div className="live-note">
      <span dir="ltr">{noteName(midi)}</span>
      <small>{noteNameAr(midi)}</small>
    </div>
  );
}

export function Bar({ value, ok }: { value: number; ok?: boolean }) {
  return (
    <div className="bar">
      <div className={'bar-fill' + (ok ? ' ok' : '')} style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` }} />
    </div>
  );
}

export function ErrorText({ text }: { text: string }) {
  return text ? <p className="error">{text}</p> : null;
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="stat">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

/** Saves a recording to the device (named by date) so she can compare by ear over weeks. */
export function SaveRecording({ url, name }: { url: string; name: string }) {
  const ext = typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm') ? 'webm' : 'm4a';
  const safe = name.replace(/\.[^.]+$/, '').replace(/[^\p{L}\p{N}_-]+/gu, '-').slice(0, 40) || 'song';
  return (
    <a className="download" href={url} download={`soty-${today()}-${safe}.${ext}`}>
      ⬇️ احفظي التسجيل على جهازك
    </a>
  );
}
