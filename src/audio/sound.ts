// The one place that plays a reference note. Sound sources:
//  - piano: Salamander Grand Piano samples bundled in public/samples/piano
//  - voice: the teacher's recordings (IndexedDB) if any, otherwise the choir "Aah" samples in public/samples/choir
// Notes between samples are pitch-shifted (playbackRate) from the nearest sample, so any cents value is exact.
// If samples are missing or fail to load, a simple oscillator tone is used.

import { audioContext, settleWithin } from './audio';
import { notePlaying } from '../lib/activity';
import { listTeacher, onTeacherChange } from './teacherStore';
import { freqToMidi, midiToFreq } from '../lib/music';
import { syllableFor } from '../lib/teacherCheck';
import { nearestSample, playbackRate, steadySegment, tuneSampleSet } from '../lib/samples';
import { extractPitchCurve } from '../lib/pitchTrack';
import { getPref, setPref } from '../lib/storage';

/** piano · voice (teacher recording, else choir) · syllable (a recorded voice singing دو ري مي on each note) */
export type SoundKind = 'piano' | 'voice' | 'syllable';

interface Loaded {
  freq: number;
  buffer: AudioBuffer;
  /** Voices can loop their middle to hold longer than the recording; a piano decays. */
  sustain: boolean;
  /** "دو ري مي" recordings: which syllable is sung */
  syllable?: string;
}

export function getSoundKind(): SoundKind {
  const v = getPref('sound');
  return v === 'voice' || v === 'syllable' ? v : 'piano';
}

export function setSoundKind(k: SoundKind) {
  setPref('sound', k);
}

const SAMPLES_URL = import.meta.env.BASE_URL + 'samples/';
let manifest: Promise<Record<string, number[]>> | null = null;
const sets: Record<string, Promise<Loaded[]>> = {};
let teacher: Promise<Loaded[]> | null = null;
onTeacherChange(() => (teacher = null));

function getManifest() {
  manifest ??= fetch(SAMPLES_URL + 'manifest.json')
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}));
  return manifest;
}

/** Pitch of the steady part of a buffer, measured with pitchy (null if unclear). */
async function measure(buffer: AudioBuffer): Promise<number | null> {
  const curve = await extractPitchCurve(buffer.getChannelData(0), buffer.sampleRate);
  return steadySegment(curve, 40, 0.2)?.freq ?? null;
}

/** Load a bundled sample set (MIDI numbers listed in manifest.json). */
function loadSet(name: 'piano' | 'choir'): Promise<Loaded[]> {
  sets[name] ??= getManifest().then(async (m) => {
    const ac = audioContext();
    const notes = m[name] ?? [];
    const decoded = await Promise.all(
      notes.map(async (midi) => {
        try {
          const res = await fetch(`${SAMPLES_URL}${name}/${midi}.mp3`);
          return { midi, buffer: await ac.decodeAudioData(await res.arrayBuffer()) };
        } catch {
          return null;
        }
      }),
    );
    const ok = decoded.filter((x): x is { midi: number; buffer: AudioBuffer } => x !== null);
    const nominal = ok.map((x) => midiToFreq(x.midi));
    // The piano is tuned to A440; sung samples are measured so pitch-shifting starts from their real pitch.
    const freqs = name === 'piano' ? nominal : tuneSampleSet(nominal, await Promise.all(ok.map((x) => measure(x.buffer))));
    return ok.map((x, i) => ({ freq: freqs[i], buffer: x.buffer, sustain: name !== 'piano' }));
  });
  return sets[name];
}

function loadTeacher(): Promise<Loaded[]> {
  teacher ??= listTeacher().then((notes) => {
    const ac = audioContext();
    return notes.map((n) => {
      const buffer = ac.createBuffer(1, n.data.length, n.sampleRate);
      buffer.copyToChannel(new Float32Array(n.data), 0);
      return { freq: n.freq, buffer, sustain: true, syllable: n.syllable };
    });
  });
  return teacher;
}

/** Which voice is used for "voice": the teacher's recordings if there are any. */
export async function voiceSourceName(): Promise<'teacher' | 'choir'> {
  return (await loadTeacher()).some((t) => !t.syllable) ? 'teacher' : 'choir';
}

/** Which "دو ري مي" syllables have a recording. */
export async function recordedSyllables(): Promise<string[]> {
  return [...new Set((await loadTeacher()).filter((t) => t.syllable).map((t) => t.syllable!))];
}

async function samplesFor(kind: SoundKind, freq?: number): Promise<Loaded[]> {
  if (kind === 'piano') return loadSet('piano');
  const t = await loadTeacher();
  if (kind === 'syllable') {
    // the voice says the note's own name: "مي" for E, pitch-shifted from the nearest "مي" recording
    const syl = freq ? syllableFor(freqToMidi(freq)) : null;
    const same = t.filter((x) => x.syllable && x.syllable === syl);
    return same.length ? same : loadSet('piano');
  }
  const voices = t.filter((x) => !x.syllable);
  return voices.length ? voices : loadSet('choir');
}

/** Start loading the chosen sounds early so the first note isn't late. */
export function preloadSounds() {
  void samplesFor(getSoundKind());
}

/**
 * Play a reference note with the chosen sound. Always resolves — when the note ends, or after its length
 * plus a margin if the audio system is paused (iOS), so screens waiting for it never lock up.
 */
export async function playNote(freq: number, seconds = 1.2, kind: SoundKind = getSoundKind()): Promise<void> {
  audioContext(); // resume inside the tap, before any await (iOS only allows that during the gesture)
  notePlaying(1);
  try {
    await settleWithin(playNoteRaw(freq, seconds, kind), (seconds + 6) * 1000); // +6 s for loading the samples the first time
  } finally {
    notePlaying(-1);
  }
}

async function playNoteRaw(freq: number, seconds: number, kind: SoundKind): Promise<void> {
  const sample = nearestSample(await samplesFor(kind, freq).catch(() => []), freq);
  if (!sample) return playOscillator(freq, seconds);

  const ac = audioContext();
  const src = ac.createBufferSource();
  src.buffer = sample.buffer;
  src.playbackRate.value = playbackRate(sample.freq, freq);
  const natural = sample.buffer.duration / src.playbackRate.value;
  if (sample.sustain && natural < seconds) {
    // hold a short sung note by looping its middle
    src.loop = true;
    src.loopStart = sample.buffer.duration * 0.3;
    src.loopEnd = sample.buffer.duration * 0.9;
  }
  const length = src.loop ? seconds : Math.min(seconds, natural);
  const t0 = ac.currentTime + 0.02;
  const gain = ac.createGain();
  const level = sample.sustain ? 0.9 : 0.8;
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(level, t0 + 0.02);
  gain.gain.setValueAtTime(level, Math.max(t0 + 0.02, t0 + length - 0.15));
  gain.gain.linearRampToValueAtTime(0, t0 + length);
  src.connect(gain).connect(ac.destination);
  src.start(t0);
  src.stop(t0 + length + 0.02);
  const ended = new Promise<void>((resolve) => {
    src.onended = () => {
      gain.disconnect();
      resolve();
    };
  });
  // once the sound is ready, a paused context still must not hang the caller
  await settleWithin(ended, (length + 1.5) * 1000);
}

/** Fallback tone: triangle wave plus a quieter octave. */
function playOscillator(freq: number, seconds: number): Promise<void> {
  const ac = audioContext();
  const t0 = ac.currentTime + 0.02;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(0.25, t0 + 0.05);
  gain.gain.setValueAtTime(0.25, t0 + seconds - 0.15);
  gain.gain.linearRampToValueAtTime(0, t0 + seconds);
  gain.connect(ac.destination);
  const oscs = [
    { type: 'triangle' as OscillatorType, mult: 1, level: 1 },
    { type: 'sine' as OscillatorType, mult: 2, level: 0.25 },
  ].map(({ type, mult, level }) => {
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.value = freq * mult;
    const g = ac.createGain();
    g.gain.value = level;
    o.connect(g).connect(gain);
    o.start(t0);
    o.stop(t0 + seconds + 0.05);
    return o;
  });
  const ended = new Promise<void>((resolve) => {
    oscs[0].onended = () => {
      gain.disconnect();
      resolve();
    };
  });
  return settleWithin(ended, (seconds + 1.5) * 1000).then(() => undefined);
}
