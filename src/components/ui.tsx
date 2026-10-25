// Small shared UI pieces.

import { createContext, useContext, type ReactNode } from 'react';
import { nearestNote, noteName, noteNameAr } from '../lib/music';
import { today } from '../lib/storage';
import { BeforeTraining } from './BeforeTraining';
import { Help } from './Help';
import { NoiseCheck } from './NoiseCheck';
import type { HelpKey } from '../content/help';

/** Inside the beginner path an exercise is shown without its own title (the path gives the instructions). */
export const EmbeddedContext = createContext(false);

/** `tips` = the "before you start" card (sound/mic pages); `mic` = also the optional room-noise check; `help` = the "❓ كيفية الاستخدام" popup button. */
export function Page({ title, intro, tips, mic, help, children }: { title: string; intro?: ReactNode; tips?: boolean; mic?: boolean; help?: HelpKey; children: ReactNode }) {
  if (useContext(EmbeddedContext)) return <div className="embedded">{children}</div>;
  return (
    <section className="page">
      <header className="page-head">
        <h1>{title}</h1>
        {help && <Help id={help} />}
      </header>
      {intro && <p className="intro">{intro}</p>}
      {(tips || mic) && (
        <div className="page-tools">
          {tips && <BeforeTraining />}
          {mic && <NoiseCheck />}
        </div>
      )}
      {children}
    </section>
  );
}

/** "خيارات": secondary settings folded away so the screen shows one main action. */
export function Options({ label = 'خيارات', children, open }: { label?: string; children: ReactNode; open?: boolean }) {
  return (
    <details className="options" open={open}>
      <summary>{label}</summary>
      <div className="options-body">{children}</div>
    </details>
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
