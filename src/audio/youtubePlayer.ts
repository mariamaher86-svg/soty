// Official YouTube IFrame Player API (embed only — the app never downloads YouTube audio).
// https://developers.google.com/youtube/iframe_api_reference

export interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  setPlaybackRate(rate: number): void;
  getPlaybackRate(): number;
  getAvailablePlaybackRates(): number[];
  destroy(): void;
}

interface YTNamespace {
  Player: new (
    el: HTMLElement,
    opts: {
      videoId: string;
      width?: string;
      height?: string;
      playerVars?: Record<string, number | string>;
      events?: { onReady?: () => void; onStateChange?: (e: { data: number }) => void; onError?: (e: { data: number }) => void };
    },
  ) => YTPlayer;
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

/** Player states from the API. */
export const YT_STATE = { ENDED: 0, PLAYING: 1, PAUSED: 2 };

let api: Promise<YTNamespace> | null = null;

/** Loads the API script once. Rejects if offline / blocked. */
export function loadYouTubeApi(): Promise<YTNamespace> {
  api ??= new Promise<YTNamespace>((resolve, reject) => {
    if (window.YT?.Player) return resolve(window.YT);
    window.onYouTubeIframeAPIReady = () => resolve(window.YT!);
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => {
      api = null;
      reject(new Error('youtube api failed to load'));
    };
    document.head.appendChild(s);
  });
  return api;
}

/** Arabic text for the player's error codes. */
export function youTubeErrorMessage(code: number): string {
  if (code === 101 || code === 150) return 'صاحب الفيديو مش سامح إنه يشتغل جوه مواقع تانية. جربي فيديو تاني (أو نسخة تانية من نفس الأغنية).';
  if (code === 100) return 'الفيديو ده مش موجود أو خاص.';
  return 'الفيديو مشتغلش (كود ' + code + ').';
}
