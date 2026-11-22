// "Are you on headphones?" The app can't hear YouTube's sound itself (the browser doesn't give it out); what goes wrong
// is that the phone's microphone hears the song from the speaker and takes it for her voice. So before singing along:
// play a short, soft test tone and listen. If the mic clearly hears it, she's on the speaker.

export type HeadphoneResult = 'headphones' | 'speaker';
/** What was decided this session: 'speaker-ok' = on the speaker and she chose to continue anyway. */
export type HeadphoneState = HeadphoneResult | 'speaker-ok' | null;

/** A high, clean tone well above most singing, played softly for a moment. */
export const TEST_TONE_HZ = 1320;
export const TEST_TONE_SECONDS = 0.8;
export const TEST_TONE_GAIN = 0.08;

/** Of the frames heard while the tone played, this share must be the tone itself for "the mic heard it". */
const HEARD_SHARE = 0.3;
const NEAR_CENTS = 60;

/** Did the mic hear the test tone? Octave errors of the pitch detector count as hearing it. */
export function speakerHeard(frames: { freq: number | null }[], toneHz = TEST_TONE_HZ): boolean {
  if (frames.length < 5) return false;
  const near = frames.filter((f) => {
    if (!f.freq) return false;
    const c = 1200 * Math.log2(f.freq / toneHz);
    const wrapped = ((((c + 600) % 1200) + 1200) % 1200) - 600;
    return Math.abs(wrapped) <= NEAR_CENTS;
  }).length;
  return near / frames.length >= HEARD_SHARE;
}

const KEY = 'soty.headphones';

/** Remembered for this session only (she may plug headphones in tomorrow). */
export function getHeadphoneState(): HeadphoneState {
  try {
    const v = sessionStorage.getItem(KEY);
    return v === 'headphones' || v === 'speaker' || v === 'speaker-ok' ? v : null;
  } catch {
    return null;
  }
}

export function setHeadphoneState(v: HeadphoneState) {
  try {
    if (v) sessionStorage.setItem(KEY, v);
    else sessionStorage.removeItem(KEY);
  } catch {
    // private mode: just not remembered
  }
}

/** Results sung while the music came out of the speaker aren't reliable. */
export const resultsReliable = (s: HeadphoneState) => s !== 'speaker' && s !== 'speaker-ok';
