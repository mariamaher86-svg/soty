// A fake Web Audio API for component tests. Time follows Date.now() (faked by vi.useFakeTimers), sources fire
// `onended` when their stop time passes — but only while the context is running, like a real paused context on iOS.
// Analysers connected to a fake microphone return a sine wave at the mic's current pitch and loudness, so the real
// pitch detector (pitchy) runs on it.

import { mic } from './fakeMic';

type Listener = (e: Event) => void;

class FakeParam {
  value: number;
  constructor(v = 0) {
    this.value = v;
  }
  setValueAtTime(v: number) {
    this.value = v;
    return this;
  }
  linearRampToValueAtTime(v: number) {
    this.value = v;
    return this;
  }
  exponentialRampToValueAtTime(v: number) {
    this.value = v;
    return this;
  }
  setTargetAtTime(v: number) {
    this.value = v;
    return this;
  }
  cancelScheduledValues() {
    return this;
  }
  cancelAndHoldAtTime() {
    return this;
  }
}

export class FakeNode {
  readonly context: FakeAudioContext;
  inputs = new Set<FakeNode>();
  outputs = new Set<FakeNode>();
  private listeners = new Map<string, Set<Listener>>();
  constructor(ctx: FakeAudioContext) {
    this.context = ctx;
    ctx.nodes.add(this);
  }
  connect<T>(target: T): T {
    if (target instanceof FakeNode) {
      this.outputs.add(target);
      target.inputs.add(this);
    }
    return target;
  }
  disconnect() {
    for (const o of this.outputs) o.inputs.delete(this);
    this.outputs.clear();
  }
  addEventListener(type: string, l: Listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(l);
  }
  removeEventListener(type: string, l: Listener) {
    this.listeners.get(type)?.delete(l);
  }
  dispatch(type: string) {
    const e = new Event(type);
    for (const l of this.listeners.get(type) ?? []) l(e);
  }
  /** the fake mic this node hears, if any (followed back through its inputs) */
  micSource(seen = new Set<FakeNode>()): FakeMediaStreamSource | null {
    if (this instanceof FakeMediaStreamSource) return this;
    seen.add(this);
    for (const i of this.inputs) {
      if (seen.has(i)) continue;
      const m = i.micSource(seen);
      if (m) return m;
    }
    return null;
  }
}

class FakeScheduledSource extends FakeNode {
  onended: ((e: Event) => void) | null = null;
  started = false;
  startAt = 0;
  stopAt: number | null = null;
  ended = false;
  start(when = 0) {
    this.started = true;
    this.startAt = Math.max(when, this.context.currentTime);
    this.context.registerSource(this, when);
  }
  stop(when = 0) {
    this.stopAt = Math.max(when, this.context.currentTime);
    this.context.wake();
  }
  finish() {
    if (this.ended) return;
    this.ended = true;
    this.onended?.(new Event('ended'));
    this.dispatch('ended');
  }
}

class FakeOscillator extends FakeScheduledSource {
  type: OscillatorType = 'sine';
  frequency = new FakeParam(440);
  detune = new FakeParam(0);
  start(when = 0) {
    // the app's plain reference tone is a triangle wave: remember which notes were played
    if (this.type === 'triangle') audioControl.tones.push(this.frequency.value);
    audioControl.started.push({ freq: this.frequency.value, when: Math.max(when, this.context.currentTime), type: this.type });
    super.start(when);
  }
}

export class FakeBuffer {
  readonly numberOfChannels: number;
  readonly length: number;
  readonly sampleRate: number;
  private data: Float32Array[];
  constructor(channels: number, length: number, sampleRate: number) {
    this.numberOfChannels = channels;
    this.length = length;
    this.sampleRate = sampleRate;
    this.data = Array.from({ length: channels }, () => new Float32Array(length));
  }
  get duration() {
    return this.length / this.sampleRate;
  }
  getChannelData(c: number) {
    return this.data[c];
  }
  copyToChannel(src: Float32Array, c: number) {
    this.data[c].set(src.subarray(0, this.length));
  }
  copyFromChannel(dst: Float32Array, c: number) {
    dst.set(this.data[c].subarray(0, dst.length));
  }
}

class FakeBufferSource extends FakeScheduledSource {
  buffer: FakeBuffer | null = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  playbackRate = new FakeParam(1);
  detune = new FakeParam(0);
  start(when = 0, _offset = 0, duration?: number) {
    super.start(when);
    // a buffer source ends by itself after its buffer (unless it loops)
    if (this.stopAt === null && !this.loop && this.buffer) this.stopAt = Math.max(when, this.context.currentTime) + (duration ?? this.buffer.duration / (this.playbackRate.value || 1));
  }
}

const waves = new Map<string, Float32Array>();
/** What each analyser buffer was last filled with, so the pitch detector (see setup.ts) can skip re-measuring a pure tone. */
export const micWave = new WeakMap<Float32Array, { freq: number; level: number }>();

class FakeAnalyser extends FakeNode {
  fftSize = 2048;
  smoothingTimeConstant = 0.8;
  minDecibels = -100;
  maxDecibels = -30;
  get frequencyBinCount() {
    return this.fftSize / 2;
  }
  getFloatTimeDomainData(buf: Float32Array) {
    const src = this.micSource();
    if (!src || !src.stream.live) return buf.fill(0);
    // on the phone's speaker, the mic also hears what the app plays (the headphones check's tone)
    if (audioControl.speakerLeak) {
      const tone = this.context.soundingTone();
      if (tone) return this.fill(buf, tone, 0.05);
    }
    // a sound that depends on the audio clock (claps on the beat)
    const timed = mic.at?.(this.context.currentTime);
    const { freq, level, noise } = timed ? { freq: timed.freq ?? null, level: timed.level ?? mic.level, noise: !!timed.noise } : mic;
    micWave.delete(buf);
    if (noise && level) {
      // a "ssss": loud but without a pitch (a fixed pseudo-random pattern, so tests stay repeatable)
      let x = 12345;
      for (let i = 0; i < buf.length; i++) {
        x = (x * 1103515245 + 12345) & 0x7fffffff;
        buf[i] = level * ((x / 0x7fffffff) * 2 - 1);
      }
      return;
    }
    if (!freq || !level) return buf.fill(0);
    this.fill(buf, freq, level);
  }
  private fill(buf: Float32Array, freq: number, level: number) {
    // the same wave for the same note (the phase doesn't matter to a pitch detector): computed once, copied after
    const key = `${freq}|${level}|${buf.length}`;
    let wave = waves.get(key);
    if (!wave) {
      const sr = this.context.sampleRate;
      wave = new Float32Array(buf.length);
      for (let i = 0; i < wave.length; i++) wave[i] = level * Math.sin((2 * Math.PI * freq * i) / sr);
      if (waves.size > 500) waves.clear();
      waves.set(key, wave);
    }
    buf.set(wave);
    micWave.set(buf, { freq, level });
  }
  getByteTimeDomainData(buf: Uint8Array) {
    const f = new Float32Array(buf.length);
    this.getFloatTimeDomainData(f);
    for (let i = 0; i < buf.length; i++) buf[i] = Math.round(128 + f[i] * 127);
  }
  getFloatFrequencyData(buf: Float32Array) {
    buf.fill(-100);
  }
  getByteFrequencyData(buf: Uint8Array) {
    buf.fill(0);
  }
}

export class FakeMediaStreamSource extends FakeNode {
  readonly stream: FakeMediaStream;
  constructor(ctx: FakeAudioContext, stream: FakeMediaStream) {
    super(ctx);
    this.stream = stream;
  }
}

class FakeGeneric extends FakeNode {
  gain = new FakeParam(1);
  pan = new FakeParam(0);
  frequency = new FakeParam(350);
  Q = new FakeParam(1);
  threshold = new FakeParam(-24);
  knee = new FakeParam(30);
  ratio = new FakeParam(12);
  attack = new FakeParam(0.003);
  release = new FakeParam(0.25);
  delayTime = new FakeParam(0);
  type = 'lowpass';
  buffer: FakeBuffer | null = null;
  curve: Float32Array | null = null;
  stream?: FakeMediaStream;
}

/** What the tests can do to every context: make resume() hang (the iOS "stuck" bug), or fail decoding. */
export const audioControl = {
  /** resume() never settles and the state stays as it is */
  stuck: false,
  /** decodeAudioData rejects */
  decodeFails: false,
  contexts: [] as FakeAudioContext[],
  /** what any decoded file contains: its length and the note (Hz) at each moment */
  song: { seconds: 1, freqAt: (_t: number): number | null => 220 },
  /** the phone plays on its speaker: the mic hears the app's own sounds (false = headphones) */
  speakerLeak: false,
  /** frequencies of the reference notes played (plain tone), in order */
  tones: [] as number[],
  /** every oscillator started: its frequency and audio-clock start time (metronome clicks are 1000/1600 Hz) */
  started: [] as { freq: number; when: number; type: string }[],
  reset() {
    this.speakerLeak = false;
    this.song = { seconds: 1, freqAt: () => 220 };
    this.tones = [];
    this.started = [];
    this.stuck = false;
    this.decodeFails = false;
    // the app keeps one context between tests: closing it makes the app open a fresh one
    for (const c of this.contexts) void c.close();
    this.contexts = [];
  },
  get current(): FakeAudioContext | undefined {
    return this.contexts[this.contexts.length - 1];
  },
};

export class FakeAudioContext {
  state: AudioContextState | 'interrupted' = 'suspended';
  readonly sampleRate = 44100;
  readonly destination: FakeNode;
  onstatechange: (() => void) | null = null;
  nodes = new Set<FakeNode>();
  private born = Date.now();
  private sources = new Set<FakeScheduledSource>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.destination = new FakeNode(this);
    audioControl.contexts.push(this);
    // browsers start a context created inside a tap as running; tests can still suspend it
    this.state = 'running';
  }
  get currentTime() {
    return this.state === 'running' ? (Date.now() - this.born) / 1000 : this.frozenAt;
  }
  private frozenAt = 0;
  private setState(s: FakeAudioContext['state']) {
    if (s === this.state) return;
    if (s !== 'running') this.frozenAt = this.currentTime;
    else this.born = Date.now() - this.frozenAt * 1000;
    this.state = s;
    this.onstatechange?.();
    if (s === 'running') this.wake();
  }
  /** tests: what iOS does in the background */
  interrupt() {
    this.setState('interrupted');
  }
  suspendNow() {
    this.setState('suspended');
  }
  resume(): Promise<void> {
    if (this.state === 'closed') return Promise.reject(new DOMException('closed', 'InvalidStateError'));
    if (audioControl.stuck) return new Promise(() => {});
    this.setState('running');
    return Promise.resolve();
  }
  suspend(): Promise<void> {
    this.setState('suspended');
    return Promise.resolve();
  }
  close(): Promise<void> {
    this.setState('closed');
    if (this.timer) clearTimeout(this.timer);
    return Promise.resolve();
  }
  registerSource(s: FakeScheduledSource, _when: number) {
    this.sources.add(s);
    this.wake();
  }
  /** fire the ends that are due, and wait for the next one */
  wake() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.state !== 'running') return;
    const now = this.currentTime;
    let next = Infinity;
    for (const s of [...this.sources]) {
      if (s.stopAt === null) continue;
      if (s.stopAt <= now + 1e-9) {
        this.sources.delete(s);
        s.finish();
      } else next = Math.min(next, s.stopAt);
    }
    if (next < Infinity) this.timer = setTimeout(() => this.wake(), Math.max(1, (next - now) * 1000));
  }
  /** the frequency of an oscillator sounding right now, if any */
  soundingTone(): number | null {
    const now = this.currentTime;
    for (const s of this.sources) if (s instanceof FakeOscillator && !s.ended && s.startAt <= now && (s.stopAt === null || s.stopAt > now)) return s.frequency.value;
    return null;
  }
  /** sources still playing (not ended) */
  get playing(): number {
    return [...this.sources].filter((s) => !s.ended).length;
  }
  createGain() {
    return new FakeGeneric(this);
  }
  createOscillator() {
    return new FakeOscillator(this);
  }
  createBufferSource() {
    return new FakeBufferSource(this);
  }
  createBuffer(channels: number, length: number, sampleRate: number) {
    return new FakeBuffer(channels, length, sampleRate);
  }
  createAnalyser() {
    return new FakeAnalyser(this);
  }
  createMediaStreamSource(stream: FakeMediaStream) {
    return new FakeMediaStreamSource(this, stream);
  }
  createMediaElementSource() {
    return new FakeGeneric(this);
  }
  createMediaStreamDestination() {
    const n = new FakeGeneric(this);
    n.stream = new FakeMediaStream();
    return n;
  }
  createBiquadFilter() {
    return new FakeGeneric(this);
  }
  createDynamicsCompressor() {
    return new FakeGeneric(this);
  }
  createStereoPanner() {
    return new FakeGeneric(this);
  }
  createConvolver() {
    return new FakeGeneric(this);
  }
  createDelay() {
    return new FakeGeneric(this);
  }
  createWaveShaper() {
    return new FakeGeneric(this);
  }
  createChannelMerger() {
    return new FakeGeneric(this);
  }
  createChannelSplitter() {
    return new FakeGeneric(this);
  }
  decodeAudioData(bytes: ArrayBuffer): Promise<FakeBuffer> {
    if (audioControl.decodeFails || !bytes || bytes.byteLength === 0) return Promise.reject(new DOMException('bad audio', 'EncodingError'));
    // anything that looks like audio decodes to the test's song (default: one second at 220 Hz)
    const { seconds, freqAt } = audioControl.song;
    const sr = this.sampleRate;
    const b = new FakeBuffer(1, Math.round(seconds * sr), sr);
    const d = b.getChannelData(0);
    let phase = 0;
    for (let i = 0; i < d.length; i++) {
      const f = freqAt(i / sr);
      if (f) {
        phase += (2 * Math.PI * f) / sr;
        d[i] = 0.5 * Math.sin(phase);
      }
    }
    return Promise.resolve(b);
  }
}

export class FakeOfflineAudioContext extends FakeAudioContext {
  constructor(_c: number, readonly length: number) {
    super();
  }
  startRendering() {
    return Promise.resolve(new FakeBuffer(1, this.length || 1, this.sampleRate));
  }
}

// ---- media streams (the mic)

export class FakeTrack extends EventTarget {
  readyState: 'live' | 'ended' = 'live';
  kind = 'audio';
  enabled = true;
  stop() {
    this.readyState = 'ended';
  }
  /** what a phone call or iOS does: the track ends by itself */
  endByItself() {
    if (this.readyState === 'ended') return;
    this.readyState = 'ended';
    this.dispatchEvent(new Event('ended'));
  }
  /** what the browser applied: this fake honours what was asked */
  constraints: MediaTrackConstraints = {};
  getSettings() {
    const c = this.constraints;
    return { sampleRate: 44100, echoCancellation: c.echoCancellation, noiseSuppression: c.noiseSuppression, autoGainControl: c.autoGainControl } as MediaTrackSettings;
  }
}

export class FakeMediaStream {
  tracks = [new FakeTrack()];
  get live() {
    return this.tracks.some((t) => t.readyState === 'live');
  }
  getTracks() {
    return this.tracks;
  }
  getAudioTracks() {
    return this.tracks;
  }
}
