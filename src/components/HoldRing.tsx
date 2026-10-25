// "اثبتي ثانية": a ring that fills while she holds the note in tune, so it's clear when it counts.

export function HoldRing({ progress, ok, label = 'اثبتي ثانية' }: { progress: number; ok?: boolean; label?: string }) {
  const p = Math.max(0, Math.min(1, progress));
  const R = 34;
  const C = 2 * Math.PI * R;
  return (
    <div className={'hold-ring' + (ok ? ' ok' : '')} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p * 100)} aria-label={label}>
      <svg viewBox="0 0 80 80" width="80" height="80">
        <circle className="track" cx="40" cy="40" r={R} />
        <circle className="fill" cx="40" cy="40" r={R} strokeDasharray={C} strokeDashoffset={C * (1 - p)} transform="rotate(-90 40 40)" />
      </svg>
      <span>{ok ? '✔' : p > 0 ? `${Math.round(p * 100)}%` : ''}</span>
      <small>{ok ? 'اتحسبت!' : label}</small>
    </div>
  );
}
