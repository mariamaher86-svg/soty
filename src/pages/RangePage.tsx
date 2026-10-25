import { useRef, useState } from 'react';
import { ErrorText, LiveNote, Page, Stat } from '../components/ui';
import { SoundPicker } from '../components/SoundPicker';
import { useMic } from '../audio/useMic';
import { playNote } from '../audio/sound';
import { midiToFreq, noteName, noteNameAr } from '../lib/music';
import { SteadyNoteDetector } from '../lib/stats';
import { classifyVoice, voiceTypeGuess } from '../lib/voice';
import { getGender } from '../lib/gender';
import { addResult, getRange, saveRange, today } from '../lib/storage';

type Step = 'intro' | 'low' | 'high' | 'result';

export function RangePage({ onResult }: { onResult?: (low: number, high: number) => void } = {}) {
  const [step, setStep] = useState<Step>('intro');
  const [low, setLow] = useState<number | null>(null);
  const [high, setHigh] = useState<number | null>(null);
  const [saved, setSaved] = useState(getRange);
  const detector = useRef(new SteadyNoteDetector());
  const stepRef = useRef(step);
  stepRef.current = step;

  const { frame, error, start, stop } = useMic((f) => {
    const steady = detector.current.update(f.t, f.freq);
    if (steady === null) return;
    const m = Math.round(steady);
    if (stepRef.current === 'low') setLow((cur) => (cur === null || m < cur ? m : cur));
    if (stepRef.current === 'high') setHigh((cur) => (cur === null || m > cur ? m : cur));
  });

  const begin = async (s: 'low' | 'high') => {
    detector.current = new SteadyNoteDetector();
    if (s === 'low') setLow(null);
    else setHigh(null);
    setStep(s);
    await start();
  };

  const finish = () => {
    stop();
    setStep('result');
    if (low !== null && high !== null && high > low) {
      const v = classifyVoice(low, high, getGender());
      const r = { low, high, voiceType: v.id, date: today() };
      saveRange(r);
      setSaved(r);
      addResult('range', high - low, `${noteName(low)}–${noteName(high)}`);
      onResult?.(low, high);
    }
  };

  const voice = low !== null && high !== null && high > low ? classifyVoice(low, high, getGender()) : null;

  return (
    <Page tips mic help="range" title="اختبار المساحة الصوتية" intro="هنعرف أوطى وأعلى نغمة تقدري تثبتي عليها براحة، ومنها طبقة صوتك. التمارين التانية هتختار نغمات على قد صوتك.">
      <ErrorText text={error} />

      {step === 'intro' && (
        <>
          {saved && (
            <div className="panel">
              <p>آخر نتيجة ({saved.date}):</p>
              <RangeSummary low={saved.low} high={saved.high} />
            </div>
          )}
          <button className="big" onClick={() => begin('low')}>
            ابدئي الاختبار
          </button>
        </>
      )}

      {(step === 'low' || step === 'high') && (
        <div className="panel center">
          <h2>{step === 'low' ? '١. غني أوطى نغمة تقدري عليها' : '٢. غني أعلى نغمة تقدري عليها'}</h2>
          <p className="hint">
            {step === 'low'
              ? 'قولي "آآآ" وانزلي بالراحة، واثبتي على النغمة ثانية تقريبًا. متضغطيش على صوتك.'
              : 'قولي "آآآ" واطلعي بالراحة، واثبتي على النغمة ثانية. ممكن تستخدمي صوت الرأس.'}
          </p>
          <LiveNote freq={frame?.freq ?? null} />
          <Stat
            label={step === 'low' ? 'أوطى نغمة ثابتة لحد دلوقتي' : 'أعلى نغمة ثابتة لحد دلوقتي'}
            value={(step === 'low' ? low : high) !== null ? <NoteLabel midi={(step === 'low' ? low : high)!} /> : '—'}
          />
          {step === 'low' ? (
            <button className="big" disabled={low === null} onClick={() => begin('high')}>
              التالي ←
            </button>
          ) : (
            <button className="big" disabled={high === null} onClick={finish}>
              شوفي النتيجة
            </button>
          )}
        </div>
      )}

      {step === 'result' && (
        <div className="panel center">
          {voice && low !== null && high !== null ? (
            <>
              <RangeSummary low={low} high={high} />
              <p className="hint">النتيجة اتحفظت. الطبقة تقريبية — مساحة الصوت بتكبر مع التمرين.</p>
              <SoundPicker />
              <div className="row">
                <button onClick={() => playNote(midiToFreq(low), 1.5)}>اسمعي أوطى نغمة</button>
                <button onClick={() => playNote(midiToFreq(high), 1.5)}>اسمعي أعلى نغمة</button>
              </div>
            </>
          ) : (
            <p>محتاجين أعلى نغمة تكون أعلى من أوطى نغمة. جربي تاني.</p>
          )}
          <button className="big" onClick={() => setStep('intro')}>
            تمام
          </button>
        </div>
      )}
    </Page>
  );
}

function NoteLabel({ midi }: { midi: number }) {
  return (
    <span>
      <span dir="ltr">{noteName(midi)}</span> <small>({noteNameAr(midi)})</small>
    </span>
  );
}

function RangeSummary({ low, high }: { low: number; high: number }) {
  const { best, alt } = voiceTypeGuess(low, high, getGender());
  const semis = high - low;
  return (
    <div className="stats">
      <Stat label="المساحة" value={<span dir="ltr">{noteName(low)}–{noteName(high)}</span>} />
      <Stat label="طبقة الصوت المتوقعة" value={`${best.ar} (${best.en})` + (alt ? ` أو ${alt.ar}` : '')} />
      <Stat label="الاتساع" value={`${semis} نصف تون ≈ ${(semis / 12).toFixed(1)} أوكتاف`} />
      {getGender() === 'm' && (
        <p className="hint">
          الطبقة محسوبة على صوت الصدر العادي. الصوت المستعار (الفالسيتو) العالي طبيعي ومختلف عنه، والكاونترتينور (اللي بيغني عالي بالصوت المستعار) مش بيتحسب هنا. ولو الصوت لسه بيتغيّر (في سن المراهقة)، النتيجة هتتغير — اختبار تاني كل شهر.
        </p>
      )}
    </div>
  );
}
