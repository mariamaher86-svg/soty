// The headphones check before singing along: a short soft tone, and the mic listens for it.

import { useState } from 'react';
import { audioContext, micErrorMessage, startMic } from '../audio/audio';
import { getHeadphoneState, setHeadphoneState, speakerHeard, TEST_TONE_GAIN, TEST_TONE_HZ, TEST_TONE_SECONDS, type HeadphoneResult, type HeadphoneState } from '../lib/headphones';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Plays the tone through the speaker (or the headphones) and says whether the mic heard it. */
export async function runHeadphoneCheck(): Promise<HeadphoneResult> {
  const frames: { freq: number | null }[] = [];
  let listening = false;
  // raw mic on purpose: with echo cancellation the phone would hide the tone and we'd wrongly say "headphones"
  const mic = await startMic((f) => listening && frames.push({ freq: f.freq }), 0.8);
  try {
    const ac = audioContext();
    await wait(250);
    const t0 = ac.currentTime + 0.02;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'sine';
    osc.frequency.value = TEST_TONE_HZ;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(TEST_TONE_GAIN, t0 + 0.05);
    gain.gain.setValueAtTime(TEST_TONE_GAIN, t0 + TEST_TONE_SECONDS - 0.1);
    gain.gain.linearRampToValueAtTime(0, t0 + TEST_TONE_SECONDS);
    osc.connect(gain).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + TEST_TONE_SECONDS + 0.02);
    await wait(150); // the tone's start reaches the mic a moment later
    listening = true;
    await wait(TEST_TONE_SECONDS * 1000 - 200);
    listening = false;
    osc.onended = () => gain.disconnect();
  } finally {
    mic.stop();
  }
  return speakerHeard(frames) ? 'speaker' : 'headphones';
}

/**
 * The check as a card: "🎧 افحصي السماعات", then either "✔ السماعات تمام" or the speaker warning with "كمّلي برضه".
 * `onChange` gets the state for this session (results on the speaker are marked as not accurate).
 */
export function HeadphonesCheck({ onChange }: { onChange?: (s: HeadphoneState) => void }) {
  const [state, setState] = useState<HeadphoneState>(getHeadphoneState);
  const [checking, setChecking] = useState(false);
  const [err, setErr] = useState('');
  const set = (s: HeadphoneState) => {
    setHeadphoneState(s);
    setState(s);
    onChange?.(s);
  };
  const check = async () => {
    setErr('');
    setChecking(true);
    try {
      set(await runHeadphoneCheck());
    } catch (e) {
      setErr(micErrorMessage(e));
    }
    setChecking(false);
  };

  if (checking) return <p className="headphones-check hint">بنسمع… ثانية واحدة.</p>;
  if (state === 'speaker')
    return (
      <div className="headphones-check warn" role="alert">
        <p>إنتي على السماعة الخارجية — البسي سماعات عشان التطبيق يسمع صوتك إنتي بس.</p>
        <div className="row">
          <button className="primary" onClick={() => void check()}>
            لبستي السماعات، افحصي تاني
          </button>
          <button onClick={() => set('speaker-ok')}>كمّلي برضه</button>
        </div>
      </div>
    );
  return (
    <div className="headphones-check">
      {state === 'headphones' ? (
        <p className="ok-text">✔ السماعات تمام.</p>
      ) : state === 'speaker-ok' ? (
        <p className="warn-text">من غير سماعات: النتيجة مش هتبقى دقيقة.</p>
      ) : null}
      <button className={state ? 'link' : 'big primary'} onClick={() => void check()}>
        {state ? 'افحصي السماعات تاني' : '🎧 افحصي السماعات (ثانية واحدة)'}
      </button>
      {err && <p className="error">{err}</p>}
    </div>
  );
}
