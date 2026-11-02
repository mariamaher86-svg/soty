// Web Audio: one shared AudioContext and the live microphone pitch listener.
// Reference notes are played by sound.ts.

import { PitchDetector } from 'pitchy';
import { micListening } from '../lib/activity';
import { contextAction, lifecycle, type CtxState } from '../lib/lifecycle';

let ctx: AudioContext | null = null;
const ctxSubs = new Set<(ac: AudioContext) => void>();

/** Features that keep nodes in the context (the choir mix) rebuild them when it's replaced. */
export function onContextChange(cb: (ac: AudioContext) => void): () => void {
  ctxSubs.add(cb);
  return () => void ctxSubs.delete(cb);
}

/**
 * Safari's Audio Session API (iOS 17+): "playback" lets the app's sounds play even in silent mode;
 * "play-and-record" while the mic is on. Ignored by browsers that don't have it.
 */
function setAudioSession(type: 'playback' | 'play-and-record' | 'auto') {
  try {
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session) session.type = type;
  } catch {
    // not supported
  }
}

/** A fresh context (decoded sample buffers are not tied to a context, so they keep working). */
function replaceContext(): AudioContext {
  const old = ctx;
  setAudioSession('playback');
  ctx = new AudioContext();
  if (old && old.state !== 'closed') void old.close().catch(() => {});
  if (old) for (const cb of [...ctxSubs]) cb(ctx);
  return ctx;
}

export function audioContext(): AudioContext {
  if (!ctx || ctx.state === 'closed') return replaceContext();
  // "interrupted" is Safari's state after a phone call / screen lock / leaving the page
  if (ctx.state !== 'running') void ctx.resume().catch(() => {});
  return ctx;
}

/**
 * Called inside a tap: resume the context, or replace it when it can't come back (after the app was in the
 * background, or "interrupted"/"closed"). If a resume doesn't take within a moment, the next tap replaces it.
 */
export function checkAudioOnTap(): AudioContext {
  const action = contextAction((ctx?.state ?? null) as CtxState, lifecycle.audioStale);
  lifecycle.audioChecked();
  if (action === 'create' || action === 'recreate') {
    const fresh = replaceContext();
    void fresh.resume().catch(() => {}); // still inside the tap, so iOS lets it start
    return fresh;
  }
  const ac = ctx!;
  if (action === 'resume') {
    void ac.resume().catch(() => {});
    setTimeout(() => {
      if (ac === ctx && ac.state !== 'running') lifecycle.audioStale = true;
    }, 800);
  }
  return ac;
}

/**
 * iOS only lets audio (re)start inside a tap. The context is often created or paused outside one
 * (preloading, screen lock, leaving the page), and a paused context never finishes its notes.
 * So on every tap we resume it right away and play one silent sample — inside the gesture itself.
 */
export function installAudioUnlock() {
  const unlock = () => {
    const ac = checkAudioOnTap();
    if (ac.state === 'running') return;
    try {
      const b = ac.createBuffer(1, 1, 22050);
      const s = ac.createBufferSource();
      s.buffer = b;
      s.connect(ac.destination);
      s.start(0);
    } catch {
      // ignore
    }
  };
  for (const ev of ['pointerdown', 'touchend', 'keydown']) window.addEventListener(ev, unlock, { capture: true, passive: true });
}

/** A promise that always settles: resolves when `p` does, or after `ms` at the latest. */
export function settleWithin<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(undefined), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      () => {
        clearTimeout(t);
        resolve(undefined);
      },
    );
  });
}

export interface MicFrame {
  /** Milliseconds (performance.now). */
  t: number;
  /** Detected pitch in Hz, or null when unclear/silent. */
  freq: number | null;
  clarity: number;
  /** Loudness 0..1 (RMS). */
  rms: number;
}

export interface Mic {
  stream: MediaStream;
  stop: () => void;
}

/**
 * Opens the microphone and calls onFrame ~60 times a second with pitch + loudness.
 * Browser processing (echo cancel, noise suppression, auto gain) is turned off because it
 * distorts pitch and loudness.
 */
export async function startMic(onFrame: (f: MicFrame) => void, minClarity = 0.9, onLost?: () => void): Promise<Mic> {
  setAudioSession('play-and-record');
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  const ac = audioContext();
  const source = ac.createMediaStreamSource(stream);
  const analyser = ac.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);
  const buf = new Float32Array(analyser.fftSize);
  const detector = PitchDetector.forFloat32Array(analyser.fftSize);
  detector.minVolumeDecibels = -45;
  let raf = 0;
  let stopped = false;
  micListening(1);
  lifecycle.setBusy('mic', true);

  const tick = () => {
    if (stopped) return;
    analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    const rms = Math.sqrt(sum / buf.length);
    const [freq, clarity] = detector.findPitch(buf, ac.sampleRate);
    const ok = clarity >= minClarity && freq >= 60 && freq <= 1400;
    onFrame({ t: performance.now(), freq: ok ? freq : null, clarity, rms });
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  const stop = () => {
    if (stopped) return;
    stopped = true;
    micListening(-1);
    lifecycle.setBusy('mic', false);
    unsubHide();
    cancelAnimationFrame(raf);
    try {
      source.disconnect();
    } catch {
      // already gone with its context
    }
    stream.getTracks().forEach((t) => t.stop());
    setAudioSession('playback');
  };
  // iOS takes the mic away in the background (or a call ends the track): release it and say so
  const lost = () => {
    if (stopped) return;
    stop();
    onLost?.();
  };
  const unsubHide = lifecycle.onHidden(lost);
  stream.getTracks().forEach((t) => t.addEventListener('ended', lost));

  return { stream, stop };
}

/** Arabic message for a failed getUserMedia call. */
export function micErrorMessage(e: unknown): string {
  const name = e instanceof DOMException ? e.name : '';
  if (name === 'NotAllowedError') return 'الميكروفون مقفول. اسمحي للمتصفح يستخدم الميكروفون وجربي تاني.';
  if (name === 'NotFoundError') return 'مفيش ميكروفون متوصل.';
  if (!window.isSecureContext) return 'الميكروفون محتاج https أو localhost. شوفي ملف README.';
  return 'معرفناش نفتح الميكروفون: ' + String(e);
}
