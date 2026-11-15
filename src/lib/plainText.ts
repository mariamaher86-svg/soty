// Calmer screens: no emoji in body text. Titles, buttons, links and icons keep theirs (they're labels); paragraphs,
// hints and notes are shown without them. One pass over the DOM like the girl/boy wording (lib/genderDom), so new text
// is cleaned as it appears. Marks that carry meaning stay: ✔ ✘ ♯ ♭ ♩ ♪ arrows.

const EMOJI = /\p{Extended_Pictographic}️?\s?/gu;
const KEEP = new Set(['✔', '✘', '✓', '✗', '♩', '♪', '♫', '♬', '♭', '♮', '♯', '⬆', '⬇', '↩', '©']);
/** where an emoji is a label or an icon, not body text */
const LABELS = 'button, a, h1, h2, h3, summary, label, [aria-hidden], svg, .tile, .chip, .tool-chip, .stat-value, .score-value, .car-button, .badge, .pkey, .toast, input, textarea, [data-raw], .song-text, .song-title';

export function plainText(s: string): string {
  if (!/\p{Extended_Pictographic}/u.test(s)) return s;
  return s.replace(EMOJI, (m) => (KEEP.has([...m][0]) ? m : '')).replace(/ {2,}/g, ' ');
}

function fixText(node: Text) {
  const el = node.parentElement;
  if (!el || el.closest(LABELS)) return;
  const v = node.nodeValue ?? '';
  const m = plainText(v);
  if (m !== v) node.nodeValue = m;
}

function fixTree(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) return fixText(root as Text);
  if (!(root instanceof Element)) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) fixText(n as Text);
}

let running = false;

/** Starts cleaning `root` (once). */
export function startPlainText(root: HTMLElement) {
  if (running) return;
  running = true;
  fixTree(root);
  new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'characterData') fixText(m.target as Text);
      else m.addedNodes.forEach(fixTree);
    }
  }).observe(root, { subtree: true, childList: true, characterData: true });
}
