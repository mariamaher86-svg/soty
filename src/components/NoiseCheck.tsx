// "🔇 دوشة المكان": an optional 3-second room check before mic exercises.

import { useRef, useState } from 'react';
import { useMic } from '../audio/useMic';
import { noiseCheckOn, noiseLevel, roomLevel, saveNoise, setNoiseCheck, type NoiseLevel } from '../lib/noise';

const SECONDS = 3;

export function NoiseCheck() {
  const [on, setOn] = useState(noiseCheckOn);
  const [state, setState] = useState<'idle' | 'listening' | NoiseLevel | 'dismissed'>('idle');
  const values = useRef<number[]>([]);
  const t0 = useRef(0);
  const { error, start, stop } = useMic((f) => {
    values.current.push(f.rms);
    if (f.t - t0.current >= SECONDS * 1000) {
      stop();
      const rms = roomLevel(values.current);
      saveNoise(rms); // also sets how loud a voice must be to count
      setState(noiseLevel(rms));
    }
  });

  if (!on || state === 'dismissed') return null;

  const check = async () => {
    values.current = [];
    t0.current = performance.now();
    if (await start()) setState('listening');
  };

  if (state === 'idle')
    return (
      <button className="tool-chip" onClick={check} aria-label="فحص دوشة المكان ٣ ثواني — اسكتي وقتها">
        🔇 دوشة المكان؟ افحصي
      </button>
    );

  return (
    <div className={'noise-check tools-wide ' + state}>
      {state === 'listening' && <span>🎧 بنسمع المكان… اسكتي ٣ ثواني.</span>}
      {state === 'quiet' && <span>✔ المكان هادي — تمام.</span>}
      {state === 'ok' && <span>✔ المكان كويس.</span>}
      {state === 'noisy' && (
        <>
          <span>⚠️ المكان دوشة شوية — النتايج ممكن تطلع غلط.</span>
          <button onClick={() => setState('dismissed')}>كمّلي برضه</button>
        </>
      )}
      {error && <span className="hint">{error}</span>}
      {state !== 'listening' && (
        <button
          className="link"
          onClick={() => {
            setNoiseCheck(false);
            setOn(false);
          }}
        >
          متفحصيش تاني
        </button>
      )}
    </div>
  );
}
