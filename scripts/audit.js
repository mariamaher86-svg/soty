// Paste into the browser console at 393×852 (or run from a test page): counts what a beginner sees above the fold on
// each main screen. Used for the before/after numbers of the simpler design.
window.sotyAudit = async function (routes) {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const H = window.innerHeight;
  const emojiRe = /\p{Extended_Pictographic}/gu;
  const out = {};
  for (const r of routes) {
    location.hash = '#/' + r;
    await wait(500);
    window.scrollTo(0, 0);
    await wait(50);
    const inView = (el) => {
      const b = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      if (el.checkVisibility && !el.checkVisibility({ contentVisibilityAuto: true })) return false; // inside a closed <details>
      return b.width > 0 && b.height > 0 && b.top < H && b.bottom > 0 && s.visibility !== 'hidden' && s.display !== 'none';
    };
    const main = document.querySelector('main') ?? document.body;
    // the piano's keys are one control, not 61 buttons
    const buttons = [...main.querySelectorAll('button, a.button-link, a.list-row, a.tool-chip, a.tile, summary, input, select')].filter((b) => !b.classList.contains('pkey')).filter(inView).length;
    const cards = [...main.querySelectorAll('.panel, .notes, .list-row, .tile, .confirm-box, details.options, .stat')].filter(inView).length;
    let emoji = 0;
    const lines = new Set();
    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = n.nodeValue.trim();
      if (!t || !n.parentElement || !inView(n.parentElement)) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      let visible = false;
      for (const rect of range.getClientRects()) {
        if (rect.top >= H || rect.bottom <= 0 || rect.width < 2) continue;
        visible = true;
        lines.add(Math.round(rect.top / 4));
      }
      if (visible) emoji += (t.match(emojiRe) || []).length;
    }
    out[r || 'home'] = { buttons, cards, emoji, lines: lines.size, page: Math.round(main.scrollHeight) };
  }
  return out;
};
