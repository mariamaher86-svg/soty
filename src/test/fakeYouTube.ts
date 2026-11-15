// A fake YouTube IFrame Player: tests drive its clock and state; errors can be triggered.

type Events = { onReady?: () => void; onStateChange?: (e: { data: number }) => void; onError?: (e: { data: number }) => void };

export class FakePlayer {
  time = 0;
  duration = 200;
  state = -1;
  rate = 1;
  destroyed = false;
  videoId: string;
  events: Events;
  constructor(_el: HTMLElement, opts: { videoId: string; events?: Events }) {
    this.videoId = opts.videoId;
    this.events = opts.events ?? {};
    youtube.players.push(this);
    if (youtube.failWith !== null) {
      const code = youtube.failWith;
      setTimeout(() => this.events.onError?.({ data: code }), 0);
    } else setTimeout(() => this.events.onReady?.(), 0);
  }
  private set(s: number) {
    this.state = s;
    this.events.onStateChange?.({ data: s });
  }
  playVideo() {
    this.set(1);
  }
  pauseVideo() {
    this.set(2);
  }
  getCurrentTime() {
    return this.time;
  }
  getDuration() {
    return this.duration;
  }
  getPlayerState() {
    return this.state;
  }
  seekTo(s: number) {
    this.time = s;
  }
  setPlaybackRate(r: number) {
    this.rate = r;
  }
  getPlaybackRate() {
    return this.rate;
  }
  getAvailablePlaybackRates() {
    return [0.5, 0.75, 1, 1.25];
  }
  destroy() {
    this.destroyed = true;
  }
  /** tests: the video plays on by `s` seconds */
  advance(s: number) {
    this.time = Math.min(this.duration, this.time + s);
    if (this.time >= this.duration) this.set(0);
  }
}

export const youtube = {
  players: [] as FakePlayer[],
  /** the next player reports this error code instead of becoming ready */
  failWith: null as number | null,
  reset() {
    this.players = [];
    this.failWith = null;
  },
  get last(): FakePlayer | undefined {
    return this.players[this.players.length - 1];
  },
};

export function installFakeYouTube() {
  (window as unknown as { YT: unknown }).YT = { Player: FakePlayer };
}
