import { describe, expect, it } from 'vitest';
import { backOf, TABS, tabOf } from './nav';

describe('navigation', () => {
  it('four tabs, right to left: home, exercises, songs, progress', () => {
    expect(TABS.map((t) => t.ar)).toEqual(['الرئيسية', 'التمارين', 'أغانيّ', 'التقدّم']);
  });
  it('every page lights its tab; settings pages light none', () => {
    expect(tabOf('')).toBe('');
    expect(tabOf('path')).toBe('');
    expect(tabOf('match')).toBe('exercises');
    expect(tabOf('lessons/note')).toBe('exercises');
    expect(tabOf('songs/s1/choir')).toBe('songs');
    expect(tabOf('progress')).toBe('progress');
    expect(tabOf('more')).toBe('more');
    expect(tabOf('badges')).toBe('more');
  });
  it('back goes one level up, and tab roots have none', () => {
    expect(backOf('')).toBeNull();
    expect(backOf('exercises')).toBeNull();
    expect(backOf('songs')).toBeNull();
    expect(backOf('match')).toBe('exercises');
    expect(backOf('path')).toBe('');
    expect(backOf('guide')).toBe('more');
    expect(backOf('more')).toBe('');
    expect(backOf('lessons/note')).toBe('lessons');
    expect(backOf('songs/s1')).toBe('songs');
    expect(backOf('songs/s1/learn')).toBe('songs/s1');
  });
});
