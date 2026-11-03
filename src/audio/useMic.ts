import { useCallback, useEffect, useRef, useState } from 'react';
import { micErrorMessage, startMic, type Mic, type MicFrame } from './audio';

/** How often the live reading on screen updates. */
const SHOW_MS = 66;

export const MIC_LOST = 'المايك وقف لما خرجتي من التطبيق — دوسي ابدئي تاني.';

/**
 * Microphone hook. `onFrame` runs on every frame (keep exercise logic there);
 * `frame` is the latest reading for display.
 */
export function useMic(onFrame?: (f: MicFrame) => void, minClarity?: number) {
  const [frame, setFrame] = useState<MicFrame | null>(null);
  const [on, setOn] = useState(false);
  const [error, setError] = useState('');
  const mic = useRef<Mic | null>(null);
  const opening = useRef<Promise<Mic | null> | null>(null);
  const cancelled = useRef(false);
  const lastShown = useRef(0);
  const cb = useRef(onFrame);
  cb.current = onFrame;

  const stop = useCallback(() => {
    cancelled.current = true; // a stream still being opened is closed as soon as it arrives
    mic.current?.stop();
    mic.current = null;
    setOn(false);
    setFrame(null);
  }, []);

  const start = useCallback(() => {
    if (mic.current) return Promise.resolve(mic.current);
    cancelled.current = false;
    if (opening.current) return opening.current; // two quick taps must not open two streams
    setError('');
    opening.current = (async () => {
      try {
        const m = await startMic(
          (f) => {
            // the exercise sees every frame; the screen is redrawn about 15 times a second, not 60
            if (f.t - lastShown.current >= SHOW_MS) {
              lastShown.current = f.t;
              setFrame(f);
            }
            cb.current?.(f);
          },
          minClarity,
          () => {
            // iOS took the mic away (app left, screen locked, a call): stop cleanly and ask for a new tap
            mic.current = null;
            setOn(false);
            setFrame(null);
            setError(MIC_LOST);
          },
        );
        if (cancelled.current) {
          m.stop();
          return null;
        }
        mic.current = m;
        setOn(true);
        return m;
      } catch (e) {
        setError(micErrorMessage(e));
        return null;
      } finally {
        opening.current = null;
      }
    })();
    return opening.current;
  }, [minClarity]);

  useEffect(() => stop, [stop]);

  return { frame, on, error, start, stop };
}
