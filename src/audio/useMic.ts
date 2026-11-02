import { useCallback, useEffect, useRef, useState } from 'react';
import { micErrorMessage, startMic, type Mic, type MicFrame } from './audio';

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
  const cb = useRef(onFrame);
  cb.current = onFrame;

  const stop = useCallback(() => {
    mic.current?.stop();
    mic.current = null;
    setOn(false);
    setFrame(null);
  }, []);

  const start = useCallback(async () => {
    if (mic.current) return mic.current;
    setError('');
    try {
      mic.current = await startMic(
        (f) => {
          setFrame(f);
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
      setOn(true);
      return mic.current;
    } catch (e) {
      setError(micErrorMessage(e));
      return null;
    }
  }, [minClarity]);

  useEffect(() => stop, [stop]);

  return { frame, on, error, start, stop };
}
