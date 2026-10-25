// Masculine mode for the whole screen: every text node and a few attributes are passed through
// `toMasc` (from lib/gender) as React renders them. One place, so buttons, help notes and messages from
// the logic always match. The user's own text (song titles, lyrics, notes, inputs) is never touched.

import { toMasc } from './gender';

const ATTRS = ['placeholder', 'aria-label', 'title'];
const SKIP = 'input, textarea, [data-raw], .song-text, .song-title, .song-banner b';

function skip(el: Element | null): boolean {
  return !!el?.closest(SKIP);
}

function fixText(node: Text) {
  if (skip(node.parentElement)) return;
  const v = node.nodeValue ?? '';
  const m = toMasc(v);
  if (m !== v) node.nodeValue = m;
}

function fixAttrs(el: Element) {
  if (skip(el) && !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (v) {
      const m = toMasc(v);
      if (m !== v) el.setAttribute(a, m);
    }
  }
}

function fixTree(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) return fixText(root as Text);
  if (!(root instanceof Element)) return;
  fixAttrs(root);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) fixText(n as Text);
    else fixAttrs(n as Element);
  }
}

let running = false;
export const masculineRunning = () => running;

/** Starts masculine mode on `root` (once). Going back to feminine reloads the page. */
export function startMasculine(root: HTMLElement) {
  if (running) return;
  running = true;
  fixTree(root);
  new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'characterData') fixText(m.target as Text);
      else if (m.type === 'attributes') fixAttrs(m.target as Element);
      else m.addedNodes.forEach(fixTree);
    }
  }).observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  // the tab title too
  document.title = toMasc(document.title);
}
