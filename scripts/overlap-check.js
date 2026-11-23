// Run in the browser (any size, e.g. 393×852 or 375×667): does any text end up hidden under a fixed or sticky
// element, or under a popup's own button? Opens every "❓" help popup (one per feature), scrolls its text to the
// end and checks the last line ends above the footer; then scrolls every page to the bottom and checks the last
// text isn't covered by the tab bar, a sticky button or the piano. Returns the problems found.
window.sotyOverlapCheck = async function (routes) {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const problems = [];
  // measure the final layout: a background tab doesn't advance CSS animations (the sheet's slide-up would stay 24px low)
  const still = document.createElement('style');
  still.textContent = '*, *::before, *::after { animation: none !important; transition: none !important; }';
  document.head.append(still);
  let popups = 0;
  let pages = 0;
  let sheets = 0;

  /** the last element with its own visible text inside `root` */
  const lastText = (root, except) => {
    const els = [...root.querySelectorAll('p, li, h1, h2, h3, span, b, a, button, dd, dt, td, small, label')].filter((e) => {
      if (except && except.contains(e)) return false;
      if (e.checkVisibility && !e.checkVisibility()) return false; // inside a closed <details>
      const own = [...e.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim());
      const r = e.getBoundingClientRect();
      return own && r.width > 0 && r.height > 0;
    });
    return els.sort((a, b) => a.getBoundingClientRect().bottom - b.getBoundingClientRect().bottom).at(-1);
  };
  const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  const covering = () =>
    [...document.querySelectorAll('body *')].filter((e) => {
      const p = getComputedStyle(e).position;
      return (p === 'fixed' || p === 'sticky') && e.getBoundingClientRect().height > 0 && !e.closest('.dialog-backdrop, .modal-backdrop');
    });

  for (const r of routes) {
    location.hash = '#/' + r;
    await wait(350);
    // 1. the help popup
    const toggle = [...document.querySelectorAll('main .help-toggle')].find((t) => !t.checkVisibility || t.checkVisibility());
    if (toggle) {
      toggle.click();
      await wait(150);
      // the shared layout, or the older one (the popup scrolls as a whole and its big button is the "footer")
      const dialog = document.querySelector('.dialog') ?? document.querySelector('.modal');
      const body = dialog?.querySelector('.dialog-body') ?? dialog;
      const footer = dialog?.querySelector('.dialog-footer') ?? dialog?.querySelector('button.big');
      if (!dialog || !body) problems.push(`${r}: no help popup opened`);
      else {
        popups++;
        body.scrollTop = body.scrollHeight;
        await wait(50);
        const last = lastText(body, footer).getBoundingClientRect();
        const limit = footer ? footer.getBoundingClientRect().top : dialog.getBoundingClientRect().bottom;
        if (last.bottom > limit + 1) problems.push(`${r}: help text ends ${Math.round(last.bottom - limit)}px under the button`);
        if (dialog.getBoundingClientRect().bottom > innerHeight + 1 || dialog.getBoundingClientRect().top < -1) problems.push(`${r}: help popup taller than the screen`);
        for (const b of dialog.querySelectorAll('button.big')) if (body.contains(b) && getComputedStyle(b).position === 'sticky') problems.push(`${r}: the button floats over the scrolling text`);
      }
      document.querySelector('[aria-label="قفل الشرح"]')?.click();
      await wait(80);
    }
    // 1b. the ⚙️ options sheet
    const gear = document.querySelector('main .options-toggle:not([hidden])');
    if (gear) {
      gear.click();
      await wait(400); // after the slide-up animation
      const sheet = document.querySelector('.dialog.sheet');
      const body = sheet?.querySelector('.dialog-body');
      const footer = sheet?.querySelector('.dialog-footer');
      if (!sheet || !body || !footer) problems.push(`${r}: options sheet without the shared layout`);
      else {
        sheets++;
        body.scrollTop = body.scrollHeight;
        await wait(50);
        const lastEl = lastText(body, footer);
        if (lastEl && lastEl.getBoundingClientRect().bottom > footer.getBoundingClientRect().top + 1) problems.push(`${r}: options end under the sheet's button`);
        if (footer.getBoundingClientRect().bottom > innerHeight + 1) problems.push(`${r}: the sheet's button is below the screen`);
      }
      document.querySelector('[aria-label="قفل الخيارات"]')?.click();
      await wait(80);
    }
    // 2. the page itself, scrolled to the end
    pages++;
    window.scrollTo(0, document.documentElement.scrollHeight);
    await wait(120);
    const main = document.querySelector('main');
    const lastEl = lastText(main);
    if (lastEl) {
      const box = lastEl.getBoundingClientRect();
      for (const c of covering()) {
        if (c.contains(lastEl) || lastEl.contains(c)) continue;
        if (overlaps(box, c.getBoundingClientRect())) problems.push(`${r}: the last text ("${lastEl.textContent.trim().slice(0, 30)}") is under ${c.className || c.tagName}`);
      }
      if (box.bottom > innerHeight) problems.push(`${r}: can't scroll the last text into view`);
    }
    window.scrollTo(0, 0);
  }
  still.remove();
  return { size: `${innerWidth}×${innerHeight}`, popups, sheets, pages, problems };
};
