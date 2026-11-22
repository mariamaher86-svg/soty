// A fake microphone: tests set what she "sings" (pitch in Hz and loudness), deny permission, or end the track.

import { FakeMediaStream } from './fakeAudio';
import { midiToFreq } from '../lib/music';

export const mic = {
  /** Hz; null = silence */
  freq: null as number | null,
  /** 0..1 amplitude of the sine (0.3 ≈ normal singing) */
  level: 0.3,
  /** a pitchless noise (a "ssss") instead of a note */
  noise: false,
  /** overrides the above by audio-clock time (seconds), e.g. claps on the beat */
  at: null as null | ((t: number) => { freq?: number | null; level?: number; noise?: boolean } | null),
  /** getUserMedia fails with this DOMException name */
  deny: null as null | 'NotAllowedError' | 'NotFoundError' | 'NotReadableError',
  streams: [] as FakeMediaStream[],
  /** what each getUserMedia call asked for */
  constraints: [] as MediaTrackConstraints[],
  calls: 0,
  reset() {
    this.freq = null;
    this.level = 0.3;
    this.noise = false;
    this.at = null;
    this.deny = null;
    this.streams = [];
    this.constraints = [];
    this.calls = 0;
  },
  /** sing this MIDI note, optionally off by some cents */
  sing(midi: number, cents = 0) {
    this.noise = false;
    this.freq = midiToFreq(midi) * Math.pow(2, cents / 1200);
    if (!this.level) this.level = 0.3;
  },
  silence() {
    this.freq = null;
    this.noise = false;
  },
  /** a long "ssss" */
  hiss() {
    this.freq = null;
    this.noise = true;
  },
  /** short loud claps at these audio-clock times (seconds) */
  clapAt(times: number[]) {
    this.at = (t) => (times.some((c) => t >= c && t - c < 0.06) ? { noise: true, level: 0.5 } : { level: 0.001, noise: true });
  },
  /** streams still open */
  get open(): number {
    return this.streams.filter((s) => s.live).length;
  },
  /** iOS takes the mic away (a call, the app in the background) */
  endAll() {
    for (const s of this.streams) for (const t of s.tracks) t.endByItself();
  },
};

export function installFakeMic() {
  const getUserMedia = async (c?: MediaStreamConstraints) => {
    mic.calls++;
    mic.constraints.push((c?.audio ?? {}) as MediaTrackConstraints);
    if (mic.deny) throw new DOMException('mic', mic.deny);
    const s = new FakeMediaStream();
    s.tracks[0].constraints = (c?.audio ?? {}) as MediaTrackConstraints;
    mic.streams.push(s);
    return s as unknown as MediaStream;
  };
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia,
      enumerateDevices: async () => [{ kind: 'audioinput', deviceId: 'fake', label: 'fake', groupId: '' }],
      addEventListener() {},
      removeEventListener() {},
    },
  });
}
