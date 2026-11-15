// Fake <audio> playback and MediaRecorder: a player's time moves with the fake clock while it plays and it ends by
// itself at its duration. Tests set `media.duration` before the app opens a file.

type Handler = ((e: Event) => void) | null;

export const media = {
  /** seconds of every file opened from now on */
  duration: 4,
  /** play() rejects (like iOS without a tap) */
  playFails: false,
  players: [] as FakeAudioElement[],
  recorders: [] as FakeMediaRecorder[],
  reset() {
    this.duration = 4;
    this.playFails = false;
    this.players = [];
    this.recorders = [];
  },
  get last(): FakeAudioElement | undefined {
    return this.players[this.players.length - 1];
  },
};

export class FakeAudioElement extends EventTarget {
  src = '';
  preload = 'auto';
  volume = 1;
  muted = false;
  loop = false;
  playbackRate = 1;
  crossOrigin: string | null = null;
  onended: Handler = null;
  onplay: Handler = null;
  onpause: Handler = null;
  ontimeupdate: Handler = null;
  onloadedmetadata: Handler = null;
  onerror: Handler = null;
  oncanplay: Handler = null;
  readyState = 4;
  private pos = 0;
  private startedAt: number | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  readonly duration: number;
  constructor(src?: string) {
    super();
    this.src = src ?? '';
    this.duration = media.duration;
    media.players.push(this);
    setTimeout(() => {
      this.onloadedmetadata?.(new Event('loadedmetadata'));
      this.dispatchEvent(new Event('loadedmetadata'));
      this.oncanplay?.(new Event('canplay'));
      this.dispatchEvent(new Event('canplay'));
    }, 0);
  }
  get paused() {
    return this.startedAt === null;
  }
  get ended() {
    return this.pos >= this.duration && this.paused;
  }
  get currentTime() {
    if (this.startedAt === null) return this.pos;
    return Math.min(this.duration, this.pos + ((Date.now() - this.startedAt) / 1000) * this.playbackRate);
  }
  set currentTime(t: number) {
    const playing = !this.paused;
    this.pos = Math.max(0, Math.min(this.duration, t));
    if (playing) {
      this.startedAt = Date.now();
      this.schedule();
    }
  }
  private fire(type: string) {
    const h = (this as unknown as Record<string, Handler>)['on' + type];
    h?.(new Event(type));
    this.dispatchEvent(new Event(type));
  }
  private schedule() {
    if (this.timer) clearTimeout(this.timer);
    const left = ((this.duration - this.currentTime) / this.playbackRate) * 1000;
    this.timer = setTimeout(() => {
      this.pos = this.duration;
      this.startedAt = null;
      this.timer = null;
      this.fire('pause');
      this.fire('ended');
    }, Math.max(0, left));
  }
  play(): Promise<void> {
    if (media.playFails) return Promise.reject(new DOMException('no gesture', 'NotAllowedError'));
    if (!this.src) return Promise.reject(new DOMException('no source', 'NotSupportedError'));
    if (this.pos >= this.duration) this.pos = 0;
    if (this.paused) {
      this.startedAt = Date.now();
      this.schedule();
      this.fire('play');
      this.fire('playing');
    }
    return Promise.resolve();
  }
  pause() {
    if (this.paused) return;
    this.pos = this.currentTime;
    this.startedAt = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.fire('pause');
  }
  load() {}
  removeAttribute(name: string) {
    if (name === 'src') this.src = '';
  }
  setAttribute(name: string, v: string) {
    if (name === 'src') this.src = v;
  }
  canPlayType() {
    return 'maybe';
  }
}

export class FakeMediaRecorder extends EventTarget {
  static isTypeSupported = () => true;
  state: 'inactive' | 'recording' | 'paused' = 'inactive';
  mimeType = 'audio/webm';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: Handler = null;
  constructor(readonly stream: MediaStream) {
    super();
    media.recorders.push(this);
  }
  start() {
    this.state = 'recording';
  }
  stop() {
    if (this.state === 'inactive') return;
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob([new Uint8Array(100)], { type: this.mimeType }) });
    this.onstop?.();
    this.dispatchEvent(new Event('stop'));
  }
  pause() {
    this.state = 'paused';
  }
  resume() {
    this.state = 'recording';
  }
  requestData() {}
}

export function installFakeMedia() {
  Object.assign(globalThis, { Audio: FakeAudioElement, MediaRecorder: FakeMediaRecorder });
}
