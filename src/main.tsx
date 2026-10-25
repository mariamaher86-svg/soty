import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { getGender } from './lib/gender';
import { startMasculine } from './lib/genderDom';
import { installAudioUnlock } from './audio/audio';
import { registerOffline } from './audio/offline';
import './styles.css';

installAudioUnlock();
registerOffline();
const root = document.getElementById('root')!;
// "نكلمك إزاي؟": the source text is feminine; masculine mode converts what's shown (see lib/genderDom)
if (getGender() === 'm') startMasculine(root);

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
