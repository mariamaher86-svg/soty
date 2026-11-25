import { describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { button, crashed, go, leaveApp, renderApp, returnToApp, tick } from './test/app';
import { ErrorBoundary, ErrorReport, installErrorLog } from './components/ErrorBoundary';
import { browser } from './lib/reload';
import { getPref, setPref } from './lib/storage';
import { readLog } from './lib/errorLog';
import { registerOffline } from './audio/offline';
import { playNote } from './audio/sound';
import { SYNC_APPLIED_EVENT } from './sync/account';
import { lifecycle } from './lib/lifecycle';
import { advance } from './test/generation';

describe('app shell', () => {
  it('home renders with the tab bar and opens every tab without crashing', async () => {
    const { user } = renderApp('');
    expect(screen.getByRole('navigation', { name: 'الأقسام' })).toBeTruthy();
    for (const tab of ['التمارين', 'أغانيّ', 'التقدّم', 'الرئيسية']) {
      await user.click(within(screen.getByRole('navigation', { name: 'الأقسام' })).getByRole('link', { name: tab }));
      await tick(20);
      expect(crashed()).toBe(false);
    }
  });

  it('home: one greeting, one big button and three tiles (lessons, exercises, songs)', async () => {
    renderApp('');
    expect(document.querySelectorAll('main h1')).toHaveLength(1);
    expect(document.querySelectorAll('main a.big-link')).toHaveLength(1);
    expect([...document.querySelectorAll('main a.tile')].map((a) => a.getAttribute('href'))).toEqual(['#/lessons', '#/exercises', '#/songs']);
  });

  it('a new user sees one way to start: the first measurement', async () => {
    renderApp('');
    const start = screen.getAllByRole('link').find((a) => a.getAttribute('href') === '#/path/start');
    expect(start).toBeTruthy();
  });

  it('every route opens without an error screen', async () => {
    setPref('sing.mode', 'youtube'); // the sing-along opens on its YouTube mode, which had a button inside a label
    renderApp('');
    const routes = ['path', 'lessons', 'lessons/note', 'lessons/glossary', 'lessons/summaries', 'exercises', 'songs', 'car', 'guide', 'badges', 'progress', 'teacher', 'warmup', 'findnote', 'vocalise', 'ear', 'intervals', 'range', 'piano', 'match', 'maqam', 'breath', 'sing', 'key', 'rhythm', 'dynamics', 'game', 'more', 'account', 'nonsense'];
    for (const r of routes) {
      await go(r);
      expect(crashed(), r).toBe(false);
      expect(document.querySelector('main')!.textContent!.length, r).toBeGreaterThan(5);
      // a button inside a <label> becomes the labelled control: tapping the label would press it
      expect(document.querySelectorAll('label button').length, r).toBe(0);
    }
  });

  it('the back button goes one level up', async () => {
    const { user } = renderApp('lessons/note');
    await user.click(document.querySelector('a.back') as HTMLElement);
    await tick(20);
    expect(window.location.hash).toBe('#/lessons');
  });

  it('coming back after leaving mid-exercise shows the "we stopped" note, which closes by itself', async () => {
    renderApp('match');
    lifecycle.setBusy('mic', true);
    await leaveApp();
    await returnToApp();
    expect(screen.getByText(/وقفنا اللي كان شغال/)).toBeTruthy();
    await tick(7100);
    expect(screen.queryByText(/وقفنا اللي كان شغال/)).toBeNull();
  });

  it('coming back when nothing was running changes nothing', async () => {
    renderApp('match');
    await leaveApp();
    await returnToApp();
    expect(screen.queryByText(/وقفنا اللي كان شغال/)).toBeNull();
  });

  it('a note shows when the piano samples are missing (a plain tone plays instead)', async () => {
    renderApp('');
    await act(async () => {
      void playNote(440, 0.5);
    });
    await tick(800);
    expect(screen.getByText(/أصوات البيانو متحمّلتش/)).toBeTruthy();
  });

  it('offline: a small note, and it goes when the internet is back', async () => {
    renderApp('');
    await act(async () => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByText(/مفيش إنترنت/)).toBeTruthy();
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.queryByText(/مفيش إنترنت/)).toBeNull();
  });

  it('data from the other device redraws the page, but never mid-exercise', async () => {
    renderApp('progress');
    const before = document.querySelector('main section');
    await act(async () => {
      window.dispatchEvent(new CustomEvent(SYNC_APPLIED_EVENT, { detail: ['soty.v1'] }));
    });
    expect(document.querySelector('main section')).not.toBe(before);
    lifecycle.setBusy('mic', true);
    const during = document.querySelector('main section');
    await act(async () => {
      window.dispatchEvent(new CustomEvent(SYNC_APPLIED_EVENT, { detail: ['soty.v1'] }));
    });
    expect(document.querySelector('main section')).toBe(during);
    lifecycle.setBusy('mic', false);
  });

  it('a gender change from the other device reloads the wording', async () => {
    renderApp('');
    await act(async () => {
      window.dispatchEvent(new CustomEvent(SYNC_APPLIED_EVENT, { detail: ['soty.pref.gender'] }));
    });
    expect(browser.reload).toHaveBeenCalled();
  });

  it('after the app was killed last time, a note says so', async () => {
    window.__sotyKilled = true;
    const { user } = renderApp('');
    expect(screen.getByText(/اتقفل فجأة/)).toBeTruthy();
    await user.click(screen.getAllByRole('button', { name: 'إخفاء' })[0]);
    expect(screen.queryByText(/اتقفل فجأة/)).toBeNull();
    window.__sotyKilled = false;
  });
});

describe('the update banner', () => {
  it('shows when a new version is waiting, and "حدّثي" asks it to take over, then reloads', async () => {
    const listeners: Record<string, () => void> = {};
    const waiting = { state: 'installed', postMessage: vi.fn(), addEventListener() {} };
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        controller: {},
        register: async () => ({ waiting, installing: null, addEventListener() {}, update: async () => {} }),
        addEventListener: (t: string, f: () => void) => (listeners[t] = f),
      },
    });
    registerOffline(true);
    const { user } = renderApp('');
    await tick(10);
    await user.click(button('حدّثي'));
    expect(waiting.postMessage).toHaveBeenCalledWith('skipWaiting');
    listeners.controllerchange();
    expect(browser.reload).toHaveBeenCalledTimes(1);
  });
});

describe('welcome', () => {
  it('first open: the screens, the girl/boy choice, then the first measurement', async () => {
    const { user } = renderApp('', { prime: false });
    expect(screen.getByRole('dialog', { name: 'ترحيب' })).toBeTruthy();
    await user.click(button('التالي ←'));
    await user.click(button('التالي ←'));
    expect((button('التالي ←') as HTMLButtonElement).disabled).toBe(true); // must pick first
    await user.click(button(/بنت/));
    await tick(200);
    await user.click(button('التالي ←'));
    await user.click(button(/نبدأ من هنا/));
    await tick(20);
    expect(getPref('welcome.done')).toBe('1');
    expect(getPref('gender')).toBe('f');
    expect(window.location.hash).toBe('#/path'); // the path opens straight on the first measurement
    expect(screen.getByText(/الخطوة ١ من ٥/)).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'ترحيب' })).toBeNull();
  });

  it('can be skipped, and is not shown again', async () => {
    const { user, unmount } = renderApp('', { prime: false });
    await user.click(button('تخطي الترحيب'));
    unmount();
    renderApp('', { prime: false });
    expect(screen.queryByRole('dialog', { name: 'ترحيب' })).toBeNull();
  });

  it('someone who started before the choice existed is asked on home, without blocking', async () => {
    setPref('welcome.done', '1');
    const { user } = renderApp('', { prime: false });
    expect(screen.getByText(/نكلمك إزاي/)).toBeTruthy();
    await user.click(button(/بنت/));
    expect(getPref('gender')).toBe('f');
    expect(screen.queryByText(/نكلمك إزاي/)).toBeNull();
  });
});

describe('error screen and crash report', () => {
  function Boom(): never {
    throw new Error('boom at user@example.com');
  }

  it('a page that throws shows a friendly screen, logs it without the email, and can be retried', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let fail = true;
    const Maybe = () => (fail ? <Boom /> : <p>ok now</p>);
    const user = userEvent.setup({ advanceTimers: (ms) => advance(ms) });
    render(
      <ErrorBoundary>
        <Maybe />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert').textContent).toMatch(/حصلت مشكلة/);
    const log = readLog();
    expect(log.at(-1)!.kind).toBe('render');
    expect(log.at(-1)!.msg).not.toMatch(/example\.com/);
    fail = false;
    await user.click(button(/رجّعيها تاني/));
    expect(screen.getByText('ok now')).toBeTruthy();
  });

  it('the whole-app screen reloads instead', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup({ advanceTimers: (ms) => advance(ms) });
    render(
      <ErrorBoundary whole>
        <Boom />
      </ErrorBoundary>,
    );
    await user.click(button(/رجّعيها تاني/));
    expect(browser.reload).toHaveBeenCalled();
  });

  it('errors from timers and promises go to the log, and the report can be copied or cleared', async () => {
    installErrorLog();
    window.dispatchEvent(new ErrorEvent('error', { message: 'late failure' }));
    const user = userEvent.setup({ advanceTimers: (ms) => advance(ms) });
    // after setup(): user-event installs its own clipboard
    const writeText = vi.fn(async (_text: string) => {});
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<ErrorReport />);
    await user.click(screen.getByText(/تقرير الأعطال \(1\)/));
    await user.click(button(/انسخي التقرير/));
    expect(writeText.mock.calls[0][0]).toMatch(/late failure/);
    expect(screen.getByText('✔ اتنسخ')).toBeTruthy();
    await user.click(button('امسحي التقرير'));
    expect(readLog()).toHaveLength(0);
  });

  it('without a clipboard the report is shown to copy by hand', async () => {
    window.dispatchEvent(new ErrorEvent('error', { message: 'x' }));
    const user = userEvent.setup({ advanceTimers: (ms) => advance(ms) });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => Promise.reject(new Error('no')) } });
    render(<ErrorReport />);
    await user.click(button(/انسخي التقرير/));
    expect((document.querySelector('textarea') as HTMLTextAreaElement).value).toMatch(/Soty report/);
  });
});
