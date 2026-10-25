// Guided-flow navigation: the main "next" works only with a real result; a separate small "skip" moves on
// without saving anything for that step.

export function StepNav({ ok, need, last, onNext, onSkip }: { ok: boolean; need: string; last?: boolean; onNext: () => void; onSkip: () => void }) {
  return (
    <div className="step-nav">
      <button className="big primary" disabled={!ok} onClick={onNext}>
        {last ? 'خلصت ✔' : 'التالي ←'}
      </button>
      {!ok && <p className="hint need">{need || 'لسه محتاجين نسمع صوتك في الخطوة دي.'}</p>}
      <button className="link skip" onClick={onSkip}>
        تخطي الخطوة
      </button>
    </div>
  );
}
