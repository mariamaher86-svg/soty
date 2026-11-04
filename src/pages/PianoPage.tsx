import { useEffect, useRef, useState } from 'react';
import { CentsMeter, ErrorText, Options, Page, Stat } from '../components/ui';
import { PianoKeyboard } from '../components/PianoKeyboard';
import { PianoVocalise } from '../components/PianoVocalise';
import { SoundPicker } from '../components/SoundPicker';
import { HoldRing } from '../components/HoldRing';
import { useMic } from '../audio/useMic';
import { playNote } from '../audio/sound';
import { playSuccess } from '../audio/chime';
import { centsToTarget, chosenLabel, keyNames, nearestKey, octavesOff, PIANO_HOLD_MS, PIANO_TOLERANCE, rangeNote, retargetToRange, targetFreq, type LabelStyle, type Quarter } from '../lib/keyboard';
import { g } from '../lib/gender';
import { BeforeTraining } from '../components/BeforeTraining';
import { NoiseCheck } from '../components/NoiseCheck';
import { quarterToneName } from '../lib/music';
import { guidance, HoldTracker, mean, median, percent } from '../lib/stats';
import { addResult, getPref, setPref } from '../lib/storage';
import { exerciseRange } from './common';

type Mode = 'target' | 'free' | 'vocalise';

const LABELS: { id: LabelStyle; ar: string }[] = [
  { id: 'solfege', ar: 'دو ري مي' },
  { id: 'letters', ar: 'C D E' },
  { id: 'both', ar: 'الاتنين' },
];

const QUARTERS: { id: Quarter; ar: string }[] = [
  { id: 0, ar: 'النغمة نفسها' },
  { id: -0.5, ar: 'نص بيمول' },
  { id: 0.5, ar: 'نص دييز' },
];

/** "A4 · لا 4", or the quarter-tone spelling ("E½♭4 · مي نص بيمول 4"). */
function targetName(midi: number, quarter: Quarter): { name: string; ar: string } {
  if (quarter !== 0) return quarterToneName(midi + quarter);
  const [ar, name] = chosenLabel(midi).split(' — ');
  return { name, ar };
}

/** "🎹 البيانو": tap any key, hear it, sing it — or see on the piano which note you're singing. */
export function PianoPage() {
  const range = useRef(exerciseRange()).current;
  // #/piano/vocalise opens straight on the vocalise tab (link from the exercises page)
  const [mode, setMode] = useState<Mode>(() => (window.location.hash.endsWith('/vocalise') ? 'vocalise' : 'target'));
  const [labels, setLabels] = useState<LabelStyle>(() => (getPref('piano.labels') as LabelStyle) || 'solfege');
  const [zoom, setZoom] = useState(() => getPref('piano.zoom') === '1');
  const [showSame, setShowSame] = useState(() => getPref('piano.same') === '1');
  const toggleSame = () =>
    setShowSame((v) => {
      setPref('piano.same', v ? '0' : '1');
      return !v;
    });
  const [quarter, setQuarter] = useState<Quarter>(0);
  const [target, setTarget] = useState<number | null>(null);
  const [listening, setListening] = useState(false);
  const [progress, setProgress] = useState(0);
  const [success, setSuccess] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [tally, setTally] = useState({ tries: 0, hits: 0 });
  // the link to #/piano/vocalise also works while the piano page is already open
  useEffect(() => {
    const onHash = () => window.location.hash.endsWith('/vocalise') && void switchMode('vocalise');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  });
  const st = useRef({ target: null as number | null, quarter: 0 as Quarter, success: false, playing: false, last: 0, attempt: [] as number[], open: false });
  const hold = useRef(new HoldTracker(PIANO_TOLERANCE, PIANO_HOLD_MS));
  const raw = useRef<number[]>([]);
  const session = useRef({ tries: 0, hits: 0, cents: [] as number[] });
  st.current.target = target;
  st.current.quarter = quarter;

  /** close the current attempt (counted only if she actually sang) */
  const endAttempt = (hit: boolean) => {
    const s = st.current;
    if (!s.open) return;
    s.open = false;
    if (!s.attempt.length && !hit) return;
    const se = session.current;
    se.tries++;
    if (hit) se.hits++;
    if (s.attempt.length) se.cents.push(median(s.attempt));
    s.attempt = [];
    setTally({ tries: se.tries, hits: se.hits });
  };

  // save the session to Progress when leaving the page
  useEffect(
    () => () => {
      endAttempt(false);
      const se = session.current;
      if (se.tries > 0) addResult('piano', percent(se.hits, se.tries), `${se.hits}/${se.tries} — ±${Math.round(se.cents.length ? mean(se.cents) : 0)} سنت`);
    },
    [],
  );

  const { frame, error, start, stop } = useMic((f) => {
    const s = st.current;
    const dt = s.last ? f.t - s.last : 0;
    s.last = f.t;
    if (mode !== 'target' || s.target === null || s.success || s.playing) return;
    const c = f.freq ? centsToTarget(f.freq, s.target, s.quarter) : null;
    if (c !== null) {
      s.attempt.push(Math.abs(c));
      raw.current = [...raw.current.slice(-39), c];
    }
    setProgress(hold.current.update(c, dt));
    if (hold.current.done) {
      s.success = true;
      endAttempt(true);
      setSuccess(true);
      playSuccess();
      const n = targetName(s.target, s.quarter);
      setRecent((r) => [`${n.ar} (${n.name})`, ...r.filter((x) => x !== `${n.ar} (${n.name})`)].slice(0, 6));
    }
  });

  const play = async (midi: number, q: Quarter = quarter) => {
    st.current.playing = true;
    await playNote(targetFreq(midi, q), 1.2);
    st.current.playing = false;
    hold.current.reset();
  };

  /** a fresh try at the selected note */
  const resetTry = () => {
    endAttempt(false);
    st.current.success = false;
    st.current.open = true;
    st.current.attempt = [];
    raw.current = [];
    hold.current.reset();
    setSuccess(false);
    setProgress(0);
  };

  const pickKey = (midi: number) => {
    if (mode === 'free') return void playNote(targetFreq(midi, 0), 1.0);
    setTarget(midi);
    st.current.target = midi;
    if (listening) resetTry();
    void play(midi);
  };

  const sing = async () => {
    if (target === null) return;
    if (!(await start())) return;
    setListening(true);
    resetTry();
    await play(target);
  };

  /** She's a whole octave off (E2 is out of reach for many voices): the same note where she can sing it. */
  const singInMyOctave = () => {
    if (target === null) return;
    const m = retargetToRange(target, range.low, range.high, sung ? sung.midi : null);
    setTarget(m);
    st.current.target = m;
    resetTry();
    void play(m);
  };

  const stopListening = () => {
    endAttempt(false);
    stop();
    setListening(false);
    setProgress(0);
  };

  const switchMode = async (m: Mode) => {
    if (m === mode) return;
    endAttempt(false);
    setMode(m);
    setSuccess(false);
    setListening(false);
    if (m === 'free') await start();
    else stop();
  };

  const freq = frame?.freq ?? null;
  const sung = freq ? nearestKey(freq) : null;
  const cents = mode === 'target' && target !== null && freq ? centsToTarget(freq, target, quarter) : null;
  const guide = cents !== null ? guidance(cents, PIANO_TOLERANCE) : null;
  const outside = target !== null ? rangeNote(target, range.low, range.high) : null;
  const micOn = mode === 'free' || listening;
  const octaves = listening ? octavesOff(raw.current) : 0;

  return (
    <Page help="piano" title="🎹 البيانو">
      {mode === 'vocalise' && <PianoVocalise labels={labels} zoom={zoom} range={range} />}
      {mode !== 'vocalise' && (
        <PianoKeyboard
          target={mode === 'target' ? target : null}
          quarter={quarter}
          hit={micOn && sung?.onKeyboard ? sung.midi : null}
          comfort={range}
          labels={labels}
          zoom={zoom}
          onKey={pickKey}
          caption={mode === 'free' ? (sung ? `${keyNames(sung.midi).solfege} — ${keyNames(sung.midi).letter}` : <span className="hint">غنّي أي نغمة…</span>) : undefined}
          showSame={showSame}
          onToggleSame={mode === 'target' ? toggleSame : undefined}
        />
      )}

      <ErrorText text={error} />

      {mode === 'vocalise' ? null : mode === 'free' ? (
        <div className="panel center piano-panel">
          {sung ? (
            <>
              <p className={Math.abs(sung.cents) <= PIANO_TOLERANCE ? 'ok-text' : 'hint'}>
                {sung.cents === 0 ? 'في النص بالظبط' : `${sung.cents > 0 ? '+' : ''}${sung.cents} سنت ${sung.cents > 0 ? '(أعلى شوية)' : '(أوطى شوية)'}`}
              </p>
              <CentsMeter cents={sung.cents} tolerance={PIANO_TOLERANCE} range={50} />
            </>
          ) : (
            <p className="hint">البيانو بينوّر على النغمة اللي بتغنيها.</p>
          )}
        </div>
      ) : target === null ? (
        <p className="panel center hint piano-panel">دوسي على مفتاح تسمعيه، وبعدين غنّيه.</p>
      ) : (
        <div className="panel center piano-panel">
          {outside && !listening && <p className="hint piano-gentle">{outside === 'high' ? 'النغمة دي ممكن تكون عالية على صوتك' : 'النغمة دي ممكن تكون واطية على صوتك'} — غنّيها بهدوء.</p>}
          {listening && (
            <>
              <p className="hint" dir="auto">
                بتغني: {sung ? `${keyNames(sung.midi).solfege} ${keyNames(sung.midi).letter}` : '…'}
              </p>
              <CentsMeter cents={cents} tolerance={PIANO_TOLERANCE} />
              {!success && octaves !== 0 && (
                <div className="piano-octave" role="status">
                  <span>
                    {g('إنتي', 'إنت')} بتغني {octaves > 0 ? 'أعلى' : 'أوطى'} {Math.abs(octaves) > 1 ? 'بأوكتافين أو أكتر' : 'بأوكتاف'} — ده طبيعي لو النغمة بعيدة عن صوتك.
                  </span>
                  <button onClick={singInMyOctave}>غنّيها في الأوكتاف بتاعي</button>
                </div>
              )}
              <div className="piano-hold">
                <HoldRing progress={progress} ok={success} />
                <p className={'guide' + (guide?.ok || success ? ' ok-text' : '')}>{success ? '✔ مظبوط!' : guide ? `${guide.ar}${guide.ok ? '' : cents! > 0 ? ' ⬇' : ' ⬆'}` : 'غنّي النغمة…'}</p>
              </div>
            </>
          )}
          <div className="row">
            <button onClick={() => void play(target)}>🔁 تاني</button>
            {listening ? (
              success ? (
                <button className="big primary" onClick={resetTry}>
                  غنّيها تاني
                </button>
              ) : (
                <button onClick={stopListening}>⏹ وقفي</button>
              )
            ) : (
              <button className="big primary" onClick={sing}>
                🎤 غنّي النغمة دي
              </button>
            )}
          </div>
        </div>
      )}

      <div className="choices piano-modes" role="group" aria-label="الوضع">
        <button className={mode === 'target' ? 'chip active' : 'chip'} onClick={() => void switchMode('target')}>
          🎯 اختاري وغنّي
        </button>
        <button className={mode === 'free' ? 'chip active' : 'chip'} onClick={() => void switchMode('free')}>
          🎙️ وريني بغني إيه
        </button>
        <button className={mode === 'vocalise' ? 'chip active' : 'chip'} onClick={() => void switchMode('vocalise')}>
          🎶 فوكاليز
        </button>
      </div>

      {mode !== 'vocalise' && (
        <p className="hint piano-legend">
          <span className="swatch comfort-swatch" /> المنطقة المريحة لصوتك
          {micOn && (
            <>
              {' · '}
              <span className="swatch hit-swatch" /> اللي بتغنيه
            </>
          )}
        </p>
      )}

      <div className="page-tools">
        <BeforeTraining />
        <NoiseCheck />
      </div>

      <Options label={mode === 'vocalise' ? 'خيارات البيانو: الأسامي، التكبير، الصوت' : 'خيارات: الأسامي، التكبير، الصوت، الربع تون'}>
        <div className="choices" role="group" aria-label="أسامي النغمات">
          {LABELS.map((l) => (
            <button
              key={l.id}
              className={l.id === labels ? 'chip active' : 'chip'}
              onClick={() => {
                setLabels(l.id);
                setPref('piano.labels', l.id);
              }}
            >
              {l.ar}
            </button>
          ))}
        </div>
        <label className="check-row">
          <input
            type="checkbox"
            checked={zoom}
            onChange={(e) => {
              setZoom(e.target.checked);
              setPref('piano.zoom', e.target.checked ? '1' : '0');
            }}
          />
          🔍 مفاتيح أكبر
        </label>
        <SoundPicker />
        {mode !== 'vocalise' && (
          <>
            <p className="hint">الربع تون (للمقامات): اختاري النغمة، وبعدين:</p>
            <div className="choices" role="group" aria-label="الربع تون">
              {QUARTERS.map((q) => (
                <button
                  key={q.id}
                  className={q.id === quarter ? 'chip active' : 'chip'}
                  onClick={() => {
                    setQuarter(q.id);
                    if (listening) resetTry();
                    if (target !== null) void play(target, q.id);
                  }}
                >
                  {q.ar}
                </button>
              ))}
            </div>
          </>
        )}
      </Options>

      {(tally.tries > 0 || recent.length > 0) && (
        <div className="panel">
          <div className="stats">
            <Stat label="مظبوطة" value={tally.hits} />
            <Stat label="محاولات" value={tally.tries} />
          </div>
          {recent.length > 0 && (
            <p className="hint">
              آخر نغمات مظبوطة: <span dir="auto">{recent.join(' · ')}</span>
            </p>
          )}
        </div>
      )}
    </Page>
  );
}
