// Web Audio: one shared AudioContext and the live microphone pitch listener.
// Reference notes are played by sound.ts.

import { PitchDetector } from 'pitchy';
import { micListening } from '../lib/activity';

let ctx: AudioContext | null = null;

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

export function audioContext(): AudioContext {
  if (!ctx) {
    setAudioSession('playback');
    ctx = new AudioContext();
  }
  // "interrupted" is Safari's state after a phone call / screen lock / leaving the page
  if (ctx.state !== 'running') void ctx.resume().catch(() => {});
  return ctx;
}

/**
 * iOS only lets audio (re)start inside a tap. The context is often created or paused outside one
 * (preloading, screen lock, leaving the page), and a paused context never finishes its notes.
 * So on every tap we resume it right away and play one silent sample — inside the gesture itself.
 */
export function installAudioUnlock() {
  const unlock = () => {
    const ac = audioContext();
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
export async function startMic(onFrame: (f: MicFrame) => void, minClarity = 0.9): Promise<Mic> {
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

  return {
    stream,
    stop: () => {
      if (!stopped) micListening(-1);
      stopped = true;
      cancelAnimationFrame(raf);
      source.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      setAudioSession('playback');
    },
  };
}

/** Arabic message for a failed getUserMedia call. */
export function micErrorMessage(e: unknown): string {
  const name = e instanceof DOMException ? e.name : '';
  if (name === 'NotAllowedError') return 'الميكروفون مقفول. اسمحي للمتصفح يستخدم الميكروفون وجربي تاني.';
  if (name === 'NotFoundError') return 'مفيش ميكروفون متوصل.';
  if (!window.isSecureContext) return 'الميكروفون محتاج https أو localhost. شوفي ملف README.';
  return 'معرفناش نفتح الميكروفون: ' + String(e);
}
