// While the app is on screen a small marker is kept; leaving normally removes it. If iOS kills the page (out of memory)
// the marker stays behind, so the next start knows, and the report says what was running.

import { clearAlive, markAlive, pageName } from '../lib/errorLog';
import { lifecycle } from '../lib/lifecycle';

export function installAliveMarker() {
  const beat = () => markAlive(pageName(location.hash), lifecycle.busyNames());
  let timer = 0;
  const startBeat = () => {
    beat();
    clearInterval(timer);
    timer = window.setInterval(beat, 5000);
  };
  lifecycle.onHidden(() => {
    clearInterval(timer);
    clearAlive();
  });
  lifecycle.onVisible(startBeat);
  window.addEventListener('hashchange', beat);
  if (document.visibilityState !== 'hidden') startBeat();
}
