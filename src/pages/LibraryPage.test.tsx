import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { button, go, renderApp, tick } from '../test/app';
import { storageControl } from '../test/storage';
import { getPref, getSongs } from '../lib/storage';
import { getSongFile } from '../audio/songFiles';

const field = (label: RegExp) => screen.getByLabelText(label) as HTMLInputElement;

describe('song library', () => {
  it('empty library: the example song can be added in one tap', async () => {
    const { user } = renderApp('songs');
    expect(screen.getByText('المكتبة لسه فاضية')).toBeTruthy();
    await user.click(button(/ضيفي مثال/));
    await tick(20);
    expect(getSongs()).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'احنا جنود ويسوعنا قائدنا' })).toBeTruthy();
  });

  it('add a song with a title, a YouTube link, a file, a key and tags; it is listed and searchable', async () => {
    const { user } = renderApp('songs/new');
    await user.click(button(/احفظي/));
    expect(document.querySelector('.error')).toBeTruthy(); // the title is required
    await user.type(field(/اسم الأغنية/), 'ترنيمة تجربة');
    await user.type(field(/المغني/), 'الكورال');
    await user.type(field(/لينك يوتيوب/), 'https://youtu.be/dQw4w9WgXcQ');
    await user.upload(field(/ملف صوت مرجعي/), new File([new Uint8Array(2000)], 'song.mp3', { type: 'audio/mpeg' }));
    await user.selectOptions(screen.getByLabelText('القرار'), screen.getAllByRole('option').find((o) => o.textContent?.includes('صول'))!);
    await user.click(button('ترانيم'));
    await user.click(button(/احفظي/));
    await tick(50);
    const s = getSongs()[0];
    expect(s).toMatchObject({ title: 'ترنيمة تجربة', singer: 'الكورال', tags: ['ترانيم'] });
    expect(s.file).toMatchObject({ name: 'song.mp3' });
    expect((await getSongFile(s.id))!.bytes.byteLength).toBe(2000);
    expect(button(/غني مع الملف/)).toBeTruthy();
    expect(button(/غني مع يوتيوب/)).toBeTruthy();
    await go('songs');
    await user.type(screen.getByPlaceholderText(/دوري باسم الأغنية/), 'مش موجودة');
    expect(screen.queryByText('ترنيمة تجربة')).toBeNull();
    await user.clear(screen.getByPlaceholderText(/دوري باسم الأغنية/));
    await user.type(screen.getByPlaceholderText(/دوري باسم الأغنية/), 'تجربة');
    expect(screen.getByText('ترنيمة تجربة')).toBeTruthy();
  });

  it('regression (label removed the file): tapping the file label does not remove the stored file', async () => {
    const { user } = renderApp('songs/new');
    await user.type(field(/اسم الأغنية/), 'ملف');
    await user.upload(field(/ملف صوت مرجعي/), new File([new Uint8Array(10)], 'a.mp3', { type: 'audio/mpeg' }));
    await user.click(button(/احفظي/));
    await tick(50);
    await go(`songs/${getSongs()[0].id}/edit`);
    await user.click(screen.getByText(/ملف صوت مرجعي/));
    expect(screen.getByText(/متخزن: a\.mp3/)).toBeTruthy();
  });

  it('edit keeps the id and the file; removing the file deletes it', async () => {
    const { user } = renderApp('songs');
    await user.click(button(/ضيفي مثال/));
    await tick(20);
    const id = getSongs()[0].id;
    await go(`songs/${id}/edit`);
    await user.clear(field(/اسم الأغنية/));
    await user.type(field(/اسم الأغنية/), 'اسم جديد');
    await user.upload(field(/ملف صوت مرجعي/), new File([new Uint8Array(10)], 'a.mp3', { type: 'audio/mpeg' }));
    await user.click(button(/احفظي/));
    await tick(50);
    expect(getSongs()[0]).toMatchObject({ id, title: 'اسم جديد' });
    await go(`songs/${id}/edit`);
    await user.click(button('شيليه'));
    await user.click(button(/احفظي/));
    await tick(50);
    expect(getSongs()[0].file).toBeUndefined();
    expect(await getSongFile(id)).toBeFalsy();
  });

  it('delete asks first; "لأ" keeps it, "أيوه" removes it and its file', async () => {
    const { user } = renderApp('songs');
    await user.click(button(/ضيفي مثال/));
    await tick(20);
    await user.click(button(/امسحي الأغنية/));
    await user.click(button('لأ'));
    expect(getSongs()).toHaveLength(1);
    await user.click(button(/امسحي الأغنية/));
    await user.click(button('أيوه امسحيها'));
    await tick(50);
    expect(getSongs()).toHaveLength(0);
    expect(window.location.hash).toBe('#/songs');
  });

  it('singing from a song opens the sing-along with it chosen', async () => {
    const { user } = renderApp('songs/new');
    await user.type(field(/اسم الأغنية/), 'يوتيوب بس');
    await user.type(field(/لينك يوتيوب/), 'https://youtu.be/dQw4w9WgXcQ');
    await user.click(button(/احفظي/));
    await tick(50);
    await user.click(button(/غني مع يوتيوب/));
    await tick(50);
    expect(window.location.hash).toBe('#/sing');
    expect(getPref('sing.song')).toBe(getSongs()[0].id);
    expect(getPref('sing.mode')).toBe('youtube');
  });

  it('the weekly song can be picked', async () => {
    const { user } = renderApp('songs');
    await user.click(button(/ضيفي مثال/));
    await tick(20);
    await user.click(button(/اختاريها أغنية الأسبوع/));
    expect(button(/⭐ أغنية الأسبوع/)).toBeTruthy();
    expect(getPref('path.weeklySong')).toBe(getSongs()[0].id);
  });

  it('a full phone: saving says so instead of losing the song silently', async () => {
    const { user } = renderApp('songs/new');
    await user.type(field(/اسم الأغنية/), 'مش هتتحفظ');
    storageControl.quota(true);
    await user.click(button(/احفظي/));
    await tick(50);
    expect(screen.getByText(/مساحة المتصفح خلصت/)).toBeTruthy();
    storageControl.quota(false);
  });
});
