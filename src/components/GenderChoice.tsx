// "نكلمك إزاي؟ بنت / ولد": wording + voice defaults (range, voice types, sounds).

import { genderChosen, getGender, setGender, type Gender } from '../lib/gender';
import { masculineRunning, startMasculine } from '../lib/genderDom';

/** Applies a new choice. Masculine starts converting right away; going back to feminine needs a reload. */
export function applyGender(next: Gender, { reload = true } = {}) {
  const before = genderChosen() ? getGender() : 'f';
  setGender(next);
  if (!reload) {
    // inside the welcome: switch on the fly (going back to feminine after masculine needs a fresh page)
    if (next === 'm') startMasculine(document.getElementById('root')!);
    else if (masculineRunning()) window.location.reload();
    return;
  }
  if (next !== before) window.location.reload();
}

export function GenderButtons({ onChosen, reload = true }: { onChosen?: (g: Gender) => void; reload?: boolean }) {
  const current = genderChosen() ? getGender() : null;
  const choose = (g: Gender) => {
    applyGender(g, { reload });
    onChosen?.(g);
  };
  return (
    <div className="row gender-buttons" role="group" aria-label="نكلمك إزاي؟">
      <button className={current === 'f' ? 'big primary' : 'big'} onClick={() => choose('f')}>
        👧 بنت
      </button>
      <button className={current === 'm' ? 'big primary' : 'big'} onClick={() => choose('m')}>
        👦 ولد
      </button>
    </div>
  );
}

/** Small, non-blocking card on the home screen for people who started before this setting existed. */
export function GenderCard({ onDone }: { onDone: () => void }) {
  return (
    <div className="panel gender-card">
      <b>👋 نكلمك إزاي؟</b>
      <p className="hint">ده بيغيّر طريقة الكلام، والنغمات الافتراضية وطبقات الصوت على قد صوت البنات أو الولاد.</p>
      <GenderButtons onChosen={onDone} />
    </div>
  );
}
