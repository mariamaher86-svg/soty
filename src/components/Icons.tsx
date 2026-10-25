// Simple line icons for the tab bar and top bar (inherit the text colour).

const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

export function Icon({ name, size = 24 }: { name: 'home' | 'exercises' | 'songs' | 'progress' | 'more' | 'back'; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...P}>
      {name === 'home' && (
        <>
          <path d="M3 11.5 12 4l9 7.5" />
          <path d="M5.5 10v9.5h13V10" />
          <path d="M10 19.5v-5h4v5" />
        </>
      )}
      {name === 'exercises' && (
        <>
          <path d="M4 9v6M7 7v10M17 7v10M20 9v6" />
          <path d="M7 12h10" />
        </>
      )}
      {name === 'songs' && (
        <>
          <path d="M9 18V5l11-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="17" cy="16" r="3" />
        </>
      )}
      {name === 'progress' && (
        <>
          <path d="M4 20h16" />
          <path d="M6 16l4-5 3 3 5-7" />
        </>
      )}
      {name === 'more' && (
        <>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
        </>
      )}
      {name === 'back' && <path d="M9 5l7 7-7 7" />}
    </svg>
  );
}
