import { useEffect, useRef, useState } from 'react';
import { Page } from '../components/ui';
import { playNote } from '../audio/sound';
import { audioContext } from '../audio/audio';
import { buildCarSession, sessionExercises, sessionSeconds, type CarSegment } from '../lib/carSession';
import { YouTubeSearch } from '../components/Demo';
import { addr } from '../lib/gender';
import { midiToFreq } from '../lib/music';
import { todaysMaqam } from '../lib/path';
import { getPath } from '../lib/storage';
import { exerciseRange } from './common';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** An Arabic voice for speechSynthesis, if the phone has one. */
function arabicVoice(): SpeechSynthesisVoice | null {
  try {
    return speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith('ar')) ?? null;
  } catch {
    return null;
  }
}

/** Speaks the text (Arabic voice), or plays two short beeps if there is no Arabic voice. Always settles. */
async function say(text: string, onNoVoice: () => void): Promise<void> {
  const voice = typeof speechSynthesis !== 'undefined' ? arabicVoice() : null;
  if (!voice) {
    onNoVoice();
    await playNote(880, 0.12, 'piano');
    await wait(120);
    await playNote(1175, 0.12, 'piano');
    await wait(Math.min(4000, 400 + text.length * 40)); // time to read the line on screen
    return;
  }
  await new Promise<void>((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.voice = voice;
    u.lang = voice.lang;
    u.rate = 0.95;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    speechSynthesis.speak(u);
    setTimeout(resolve, 2000 + text.length * 150); // never wait forever
  });
}

/** Car mode: audio only, hands-free. One big start/pause button; no mic, no reading needed. */
export function CarPage() {
  const range = useRef(exerciseRange()).current;
  const [minutes, setMinutes] = useState(15);
  const [state, setState] = useState<'idle' | 'running' | 'paused' | 'done'>('idle');
  const [line, setLine] = useState('');
  const [noVoice, setNoVoice] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const ctl = useRef({ run: 0, paused: false, index: 0 });
  const wake = useRef<{ release: () => Promise<void> } | null>(null);
  const session = useRef<CarSegment[]>([]);

  const keepScreenOn = async (on: boolean) => {
    try {
      if (on && 'wakeLock' in navigator) wake.current = await (navigator as Navigator & { wakeLock: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock.request('screen');
      if (!on) {
        await wake.current?.release();
        wake.current = null;
      }
    } catch {
      // not supported / not allowed
    }
  };

  useEffect(
    () => () => {
      ctl.current.run++;
      void keepScreenOn(false);
      try {
        speechSynthesis.cancel();
      } catch {
        // ignore
      }
    },
    [],
  );

  const play = async () => {
    audioContext(); // unlock audio inside the tap
    const c = ctl.current;
    if (state === 'idle' || state === 'done') {
      session.current = buildCarSession(minutes, range.low, range.high, todaysMaqam(getPath().workouts.length));
      c.index = 0;
      setElapsed(0);
    }
    c.paused = false;
    const run = ++c.run;
    setState('running');
    void keepScreenOn(true);
    const segs = session.current;
    while (c.index < segs.length) {
      if (run !== c.run || c.paused) return;
      const s = segs[c.index];
      if (s.kind === 'section') {
        // just a marker for the exercise list
      } else if (s.kind === 'say') {
        setLine(addr(s.text));
        await say(addr(s.text), () => setNoVoice(true));
      } else if (s.kind === 'notes') {
        setLine(`🎹 ${addr(s.label)}`);
        for (const n of s.notes) {
          if (run !== c.run || c.paused) return;
          await playNote(midiToFreq(n.midi), n.dur, 'piano');
          if (s.gap) await wait(s.gap * 1000);
        }
      } else {
        setLine(`🎤 ${addr(s.label)}`);
        await wait(s.seconds * 1000);
      }
      if (run !== c.run || c.paused) return;
      c.index++;
      setElapsed(sessionSeconds(segs.slice(0, c.index)));
    }
    setState('done');
    setLine('برافو! خلصنا 🎉');
    void keepScreenOn(false);
  };

  const pause = () => {
    ctl.current.paused = true;
    ctl.current.run++;
    try {
      speechSynthesis.cancel();
    } catch {
      // ignore
    }
    setState('paused');
    void keepScreenOn(false);
  };

  const total = session.current.length ? sessionSeconds(session.current) : minutes * 60;
  // the exercises of the session she's about to start (or the one paused/finished)
  const preview = state === 'idle' ? buildCarSession(minutes, range.low, range.high, todaysMaqam(getPath().workouts.length)) : session.current;

  return (
    <Page help="car" title="🚗 وضع العربية" intro="جلسة طويلة بالصوت بس: التطبيق بيقول بالكلام تعملي إيه، ويعزف النغمات، وإنتي تغني معاه. من غير ميكروفون ومن غير قراية.">
      <div className="error car-safety">
        ⚠️ <b>متبصيش على الموبايل وانتي سايقة.</b> جهّزي كل حاجة (المدة، الصوت، السماعة أو بلوتوث العربية) <b>قبل</b> ما تتحركي، واضغطي ابدئي وانتي واقفة.
      </div>
      {state === 'idle' && (
        <div className="choices">
          <span className="hint">المدة:</span>
          {[10, 15, 20].map((m) => (
            <button key={m} className={m === minutes ? 'chip active' : 'chip'} onClick={() => setMinutes(m)}>
              {m} دقيقة
            </button>
          ))}
        </div>
      )}
      <div className="panel center car-panel">
        <button className={'car-button ' + state} onClick={state === 'running' ? pause : play} aria-label={state === 'running' ? 'إيقاف مؤقت' : 'ابدئي'}>
          {state === 'running' ? '⏸' : '▶️'}
        </button>
        <p className="car-line">{line || (state === 'idle' ? 'اضغطي ▶️ عشان تبدئي' : '')}</p>
        <p className="hint">
          {Math.floor(elapsed / 60)} من حوالي {Math.round(total / 60)} دقيقة
        </p>
        {noVoice && <p className="hint">الموبايل مفيهوش صوت عربي للكلام، فهنستخدم صفارتين قصيرين والجملة مكتوبة هنا.</p>}
      </div>
      {state !== 'running' && (
        <div className="panel">
          <h2>{state === 'idle' ? 'الجلسة دي فيها' : 'التمارين اللي في الجلسة'}</h2>
          <p className="hint">قبل ما تتحركي: اتفرجي إزاي كل تمرين بيتعمل.</p>
          <ol className="car-list">
            {sessionExercises(preview).map((e) => (
              <li key={e.title}>
                <b>{e.title}</b>
                <YouTubeSearch k={e.video} />
              </li>
            ))}
          </ol>
        </div>
      )}
      <div className="notes">
        <b>على الآيفون:</b>
        <ul>
          <li>الشاشة بتفضل منوّرة طول الجلسة لو الموبايل بيسمح (Wake Lock، iOS 16.4 وأحدث)، وده الأضمن.</li>
          <li>لو قفلتي الشاشة، Safari غالبًا بيوقّف الصوت — الجلسة بتقف لحد ما تفتحي وتضغطي ▶️ تاني (وبتكمل من مكانها).</li>
          <li>الصامت لازم يبقى مقفول، والصوت من سماعة العربية (بلوتوث) أو السماعات.</li>
        </ul>
      </div>
    </Page>
  );
}
