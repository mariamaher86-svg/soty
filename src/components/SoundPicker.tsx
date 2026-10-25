import { useEffect, useState } from 'react';
import { getSoundKind, preloadSounds, recordedSyllables, setSoundKind, voiceSourceName, type SoundKind } from '../audio/sound';
import { onTeacherChange } from '../audio/teacherStore';
import { getGender } from '../lib/gender';
import { Options } from './ui';

/** Choose the reference sound: piano or voice (teacher recording if there is one, else choir). */
export function SoundPicker() {
  const [kind, setKind] = useState<SoundKind>(getSoundKind);
  const [voice, setVoice] = useState<'teacher' | 'choir'>('choir');
  const [syllables, setSyllables] = useState<string[]>([]);

  useEffect(() => {
    const check = () => {
      void voiceSourceName().then(setVoice);
      void recordedSyllables().then(setSyllables);
    };
    check();
    preloadSounds();
    return onTeacherChange(check);
  }, []);

  const choose = (k: SoundKind) => {
    setSoundKind(k);
    setKind(k);
    preloadSounds();
  };

  const current = kind === 'piano' ? '🎹 بيانو' : kind === 'voice' ? (voice === 'teacher' ? 'صوت المعلم' : 'كورال') : 'دو ري مي';
  return (
    <Options label={`صوت النغمة: ${current}`}>
    <div className="choices sound-picker" role="group" aria-label="صوت النغمة">
      <button className={kind === 'piano' ? 'chip active' : 'chip'} onClick={() => choose('piano')}>
        🎹 بيانو
      </button>
      <button className={kind === 'voice' ? 'chip active' : 'chip'} onClick={() => choose('voice')}>
        🗣️ صوت ({voice === 'teacher' ? 'المعلم' : 'كورال'})
      </button>
      <button className={kind === 'syllable' ? 'chip active' : 'chip'} onClick={() => choose('syllable')}>
        🗣️ صوت بيقول النغمة (دو ري مي)
      </button>
      {kind === 'syllable' && syllables.length < 7 && (
        <span className="hint">
          {syllables.length ? `متسجل ${syllables.length} من ٧ مقاطع — الباقي بيتعزف بيانو.` : 'لسه مفيش تسجيل "دو ري مي" — لحد كده بيتعزف بيانو.'} التسجيل من «🎙️ تسجيل صوت المعلم» ← دو ري مي.
        </span>
      )}
      {getGender() === 'm' && kind === 'voice' && voice === 'choir' && (
        <span className="hint">الكورال ده أصوات ستات. لصوت رجالي: البيانو، أو تسجيل صوت معلم راجل في «🎙️ تسجيل صوت المعلم» — ده أطبع صوت تغني وراه.</span>
      )}
    </div>
    </Options>
  );
}
