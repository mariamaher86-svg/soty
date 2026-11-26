// Home: one big button that always does the right next thing (never a measurement), the course card in plain words,
// small cards for the measurements, and the optional lesson as a secondary link.
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { go, renderApp, tick } from '../test/app';
import { addResult, setPref, updatePath } from '../lib/storage';
import type { Measurement } from '../lib/path';

const m = (date: string): Measurement => ({ date, rangeLow: 50, rangeHigh: 72, matchCents: 30, matchLockSec: 2, sustainSec: 6, stabilityCents: 12, hissSec: 10 });
const big = () => document.querySelector('main a.big-link') as HTMLAnchorElement;
const bigLinks = () => document.querySelectorAll('main a.big-link');

describe('home: one big button', () => {
  it('a new user: "ابدئي تمرين النهارده" with its length; the starting measurement is a small card under it', () => {
    renderApp('');
    expect(bigLinks()).toHaveLength(1);
    expect(big().textContent).toMatch(/^ابدئي تمرين النهارده — \d+ دقيقة$/);
    expect(big().getAttribute('href')).toBe('#/path/today');
    const card = document.querySelector('a.home-card[href="#/path/start"]')!;
    expect(card.textContent).toMatch(/قياس البداية/);
  });

  it('the weekly check is due: the big button is still today\'s workout; the check is a small card that opens it directly', async () => {
    updatePath((p) => (p.baseline = m('2026-11-01')));
    renderApp('');
    expect(bigLinks()).toHaveLength(1);
    expect(big().textContent).not.toMatch(/القياس/);
    expect(big().getAttribute('href')).toBe('#/path/today');
    const card = document.querySelector('a.home-card[href="#/path/weekly"]')!;
    expect(card.textContent).toMatch(/وقت القياس الأسبوعي/);
    await go('path/weekly');
    expect(document.querySelector('.step-head h2')!.textContent).toBe('المساحة الصوتية');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('القياس الأسبوعي');
  });

  it('today is done: it says so, and the big button goes on with the course', () => {
    updatePath((p) => {
      p.baseline = m('2026-11-14');
      p.workouts = [{ date: '2026-11-15', maqam: 'rast', feeling: 'no', done: 3 }];
    });
    addResult('match', 80, '4/5');
    renderApp('');
    expect(screen.getByText(/خلّصتي تمرين النهارده/)).toBeTruthy();
    expect(big().getAttribute('href')).toBe('#/course');
    expect(big().textContent).toBe('كمّلي في كورس الصوت');
  });

  it('the streak shows only when there is one (no "0 أيام")', () => {
    renderApp('');
    expect(screen.queryByText(/ورا بعض/)).toBeNull();
  });

  it('the optional lesson is a small secondary link, not a second call to action', () => {
    renderApp('');
    const minor = document.querySelector('a.home-minor')!;
    expect(minor.textContent).toMatch(/^درس قصير لو حابة: /);
    expect(minor.classList.contains('big-link')).toBe(false);
  });
});

describe('home: the course card', () => {
  it('her level and progress in plain words, a bar, what the level teaches, its own icon; no "٠٠" and no "·" by a number', async () => {
    setPref('course', JSON.stringify({ passes: { 'l2-hold': ['2026-11-01', '2026-11-02'] }, placed: { 1: '2026-11-01' }, reached: {} }));
    renderApp('');
    const card = document.querySelector('a.course-card')!;
    expect(card.getAttribute('href')).toBe('#/course');
    expect(card.querySelector('.course-card-level')!.textContent).toBe('مستواكي: ٢ — ثبات النغمة');
    expect(card.querySelector('.course-card-done')!.textContent).toBe('خلّصتي ١ من ٤ تمارين');
    expect(card.querySelector('.course-card-teaches')!.textContent).toMatch(/تمسكي النغمة من غير ما تتهز/);
    expect((card.querySelector('.course-bar > span') as HTMLElement).style.width).toBe('25%');
    expect(card.textContent).not.toMatch(/٠٠|·/);
    expect(card.querySelector('.course-card-icon')!.textContent).toBe('🎤');
    expect(document.querySelector('.tile[href="#/lessons"] .tile-icon')!.textContent).toBe('🎓'); // a different icon
    await tick(0);
  });

  it('a new user: level 1 with nothing done yet reads cleanly', () => {
    renderApp('');
    const card = document.querySelector('a.course-card')!;
    expect(card.querySelector('.course-card-done')!.textContent).toBe('خلّصتي ٠ من ٣ تمارين');
    expect(card.textContent).not.toMatch(/٠٠/);
  });
});
