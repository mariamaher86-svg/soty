import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { getGender } from './lib/gender';
import { startMasculine } from './lib/genderDom';
import { installAudioUnlock } from './audio/audio';
import { registerOffline } from './audio/offline';
import { installLifecycle } from './lib/lifecycle';
import { installSync } from './sync/account';
import { parseAuthHash } from './lib/auth';
import { ErrorBoundary, installErrorLog } from './components/ErrorBoundary';
import { checkLastRun } from './lib/errorLog';
import { flushPendingResult } from './lib/storage';
import { installAliveMarker } from './audio/aliveMarker';

declare global {
  interface Window {
    __sotyKilled?: boolean;
  }
}
import { RecoveryPage } from './pages/RecoveryPage';
import './styles.css';

installErrorLog();
flushPendingResult(); // a round that was still going when the app was last closed
const lastRun = checkLastRun(); // ended abruptly while on screen? (iOS out of memory): logged, and she goes back to that page
if (lastRun && lastRun.route && !window.location.hash.replace(/^#\/?/, '')) window.location.hash = `#/${lastRun.route}`;
window.__sotyKilled = !!lastRun;
installAliveMarker();
installLifecycle();
installAudioUnlock();
registerOffline();
// the forgot-password link: its tokens are in the hash, so it's handled before the router (and nothing syncs in that browser)
const landing = parseAuthHash(window.location.hash);
if (!landing) installSync();
const root = document.getElementById('root')!;
// "نكلمك إزاي؟": the source text is feminine; masculine mode converts what's shown (see lib/genderDom)
if (getGender() === 'm') startMasculine(root);

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary whole>{landing ? <RecoveryPage landing={landing} /> : <App />}</ErrorBoundary>
  </StrictMode>,
);
