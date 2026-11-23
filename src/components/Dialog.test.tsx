// The popup layout can't regress into "a button floating over the text": the footer is outside the scrolling body.
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dialog } from './Dialog';
import { button, renderApp, tick } from '../test/app';
import { HELP } from '../content/help';

function parts(dialog: HTMLElement) {
  const body = dialog.querySelector(':scope > .dialog-body') as HTMLElement;
  const footer = dialog.querySelector(':scope > .dialog-footer') as HTMLElement | null;
  return { body, footer };
}

describe('shared dialog', () => {
  it('header, scrolling body and footer are siblings: the footer is never inside the body', () => {
    render(
      <Dialog title="عنوان" onClose={() => {}} footer={<button className="big primary">تمام</button>}>
        <p>نص طويل</p>
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog', { name: 'عنوان' });
    const { body, footer } = parts(dialog);
    expect([...dialog.children].map((c) => c.className)).toEqual(['dialog-head', 'dialog-body', 'dialog-footer']);
    expect(body.contains(footer)).toBe(false);
    expect(footer!.contains(screen.getByRole('button', { name: 'تمام' }))).toBe(true);
    expect(body.contains(screen.getByText('نص طويل'))).toBe(true);
  });

  it('✕, the backdrop and Esc close it; a click inside does not', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTimeAsync(ms) });
    render(
      <Dialog title="عنوان" closeLabel="قفل" onClose={onClose}>
        <p>جوه</p>
      </Dialog>,
    );
    await user.click(screen.getByText('جوه'));
    expect(onClose).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'قفل' }));
    await user.click(document.querySelector('.dialog-backdrop') as HTMLElement);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('every help popup and the options sheet use it: their buttons sit in the footer, not over the text', async () => {
    const { user } = renderApp('');
    let checked = 0;
    for (const r of [...new Set(Object.values(HELP).map((h) => h.href?.replace('#/', '')).filter((x): x is string => !!x))]) {
      window.location.hash = '#/' + r;
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      await tick(20);
      const toggle = document.querySelector('main .help-toggle') as HTMLElement | null;
      if (!toggle) continue;
      await user.click(toggle);
      const dialog = screen.getByRole('dialog');
      const { body, footer } = parts(dialog);
      expect(footer, r).toBeTruthy();
      expect(body.contains(footer), r).toBe(false);
      expect(footer!.querySelector('button.big')?.textContent, r).toBe('تمام، فهمت');
      await user.click(button('تمام، فهمت'));
      checked++;
    }
    expect(checked).toBeGreaterThan(15);
    window.location.hash = '#/match';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await tick(20);
    await user.click(button('خيارات'));
    const sheet = screen.getByRole('dialog', { name: 'خيارات' });
    expect(sheet.classList.contains('sheet')).toBe(true);
    expect(parts(sheet).body.contains(parts(sheet).footer)).toBe(false);
  });
});
