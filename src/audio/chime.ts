// A soft two-note "✔" sound for a success (synthesised, nothing to download).

import { audioContext } from './audio';

export function playSuccess() {
  try {
    const ac = audioContext();
    const t0 = ac.currentTime + 0.02;
    [880, 1318.5].forEach((f, i) => {
      const t = t0 + i * 0.11;
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.16, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
      osc.connect(gain).connect(ac.destination);
      osc.start(t);
      osc.stop(t + 0.5);
    });
  } catch {
    // no audio: the ✔ on screen is enough
  }
}
