// The one layout for every popup and sheet: a header, a body that scrolls, and a footer that is part of the layout
// (never a button floating over the text). `sheet` slides up from the bottom; otherwise it's centred.
// Esc, ✕ and the backdrop close it. `hidden` keeps it mounted but invisible (the options sheet keeps its contents).

import { useEffect, type ReactNode } from 'react';

export function Dialog({
  title,
  label,
  onClose,
  closeLabel = 'قفل',
  footer,
  sheet = false,
  hidden = false,
  children,
}: {
  title: ReactNode;
  /** the accessible name (defaults to the title when it's text) */
  label?: string;
  onClose: () => void;
  closeLabel?: string;
  footer?: ReactNode;
  sheet?: boolean;
  hidden?: boolean;
  children: ReactNode;
}) {
  useEffect(() => {
    if (hidden) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hidden, onClose]);

  return (
    <div className={sheet ? 'dialog-backdrop sheet-backdrop' : 'dialog-backdrop'} hidden={hidden} onClick={onClose}>
      <div className={sheet ? 'dialog sheet' : 'dialog'} role="dialog" aria-modal="true" aria-label={label ?? (typeof title === 'string' ? title : undefined)} onClick={(e) => e.stopPropagation()}>
        <div className="dialog-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label={closeLabel}>
            ✕
          </button>
        </div>
        <div className="dialog-body">{children}</div>
        {footer && <div className="dialog-footer">{footer}</div>}
      </div>
    </div>
  );
}
