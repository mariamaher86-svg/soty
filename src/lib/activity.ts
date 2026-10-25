// What the app is doing right now — a note playing, the mic listening — so guided steps can show
// a clear status: 🔊 listen / 🎤 your turn / ✔ done.

import { useEffect, useState } from 'react';

let playing = 0;
let listening = 0;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export function notePlaying(delta: 1 | -1) {
  playing = Math.max(0, playing + delta);
  emit();
}

export function micListening(delta: 1 | -1) {
  listening = Math.max(0, listening + delta);
  emit();
}

export type Activity = 'listen' | 'yourTurn' | 'idle';

export function currentActivity(): Activity {
  return playing > 0 ? 'listen' : listening > 0 ? 'yourTurn' : 'idle';
}

export function useActivity(): Activity {
  const [a, setA] = useState(currentActivity);
  useEffect(() => {
    const f = () => setA(currentActivity());
    subs.add(f);
    return () => {
      subs.delete(f);
    };
  }, []);
  return a;
}
