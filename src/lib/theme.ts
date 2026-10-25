// Light / dark / follow-the-phone colours (pref "theme": '' = automatic).

import { getPref, setPref } from './storage';

export type Theme = '' | 'light' | 'dark';

export function getTheme(): Theme {
  const t = getPref('theme');
  return t === 'light' || t === 'dark' ? t : '';
}

export function applyTheme(t: Theme = getTheme()) {
  if (t) document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}

export function setTheme(t: Theme) {
  setPref('theme', t);
  applyTheme(t);
}
