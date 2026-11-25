// The popup layout can't regress into "a button floating over the text": the footer is outside the scrolling body.
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dialog } from './Dialog';
import { button, renderApp, tick } from '../test/app';
import { HELP } from '../content/help';

/** Every page a help entry points to. */
const HELP_ROUTES = [...new Set(Object.values(HELP).map((h) => h.href?.replace('#/', '')).filter((x): x is string => !!x))];
import { advance } from '../test/generation';

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
    const user = userEvent.setup({ advanceTimers: (ms) => advance(ms) });
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

  // one test per page (not one test visiting every page): each stays small and a failure names its page
  it.each(HELP_ROUTES)('the help popup on #/%s uses it: its buttons sit in the footer, not over the text', async (r) => {
    const { user } = renderApp(r);
    await tick(20);
    await user.click(document.querySelector('main .help-toggle') as HTMLElement);
    const dialog = screen.getByRole('dialog');
    const { body, footer } = parts(dialog);
    expect(footer).toBeTruthy();
    expect(body.contains(footer)).toBe(false);
    expect(footer!.querySelector('button.big')?.textContent).toBe('تمام، فهمت');
    await user.click(button('تمام، فهمت'));
  });

  it('the options sheet uses it too', async () => {
    const { user } = renderApp('match');
    await tick(20);
    await user.click(button('خيارات'));
    const sheet = screen.getByRole('dialog', { name: 'خيارات' });
    expect(sheet.classList.contains('sheet')).toBe(true);
    expect(parts(sheet).body.contains(parts(sheet).footer)).toBe(false);
  });
});
