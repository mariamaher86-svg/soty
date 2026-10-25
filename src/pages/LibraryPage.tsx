import { useEffect, useState } from 'react';
import { g } from '../lib/gender';
import { ErrorText, Options, Page, Stat } from '../components/ui';
import { KeyDetector } from '../components/KeyDetector';
import { deleteSongFile, mb, saveSongFile, storageEstimate } from '../audio/songFiles';
import { getResults, getSongs, saveSongs } from '../lib/storage';
import {
  allTags,
  DIFFICULTY_AR,
  EXAMPLE_SONG,
  filterSongs,
  normalizeSong,
  recurringMoments,
  songStats,
  SUGGESTED_TAGS,
  textLines,
  validateSong,
  type Song,
  type SongSort,
} from '../lib/songs';
import { SCALES, tonicName } from '../lib/scale';
import { singSong, getWeeklySong, setWeeklySong } from './songNav';
import { partKey } from '../lib/choir';
import { ChoirPage, ChoirPartsPanel } from './ChoirPage';
import { SongExportPanel, SongImportPanel } from '../components/SongShare';
import { getPhraseProgress, LearnSongPage, PHRASE_GOOD } from './LearnSongPage';

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const MAX_FILE = 60 * 1024 * 1024;

function keyLabelOf(s: Song): string {
  if (s.tonic === undefined || !s.scaleId) return '';
  const sc = SCALES.find((x) => x.id === s.scaleId);
  return `${tonicName(s.tonic).name} ${sc?.ar ?? ''}`;
}

/** #/songs, #/songs/new, #/songs/<id>, #/songs/<id>/edit */
function route(): { view: 'list' } | { view: 'new' } | { view: 'song' | 'edit' | 'learn' | 'choir'; id: string } {
  const parts = window.location.hash.replace(/^#\/?/, '').split('/');
  if (parts[1] === 'new') return { view: 'new' };
  if (parts[1]) return { view: parts[2] === 'edit' ? 'edit' : parts[2] === 'learn' ? 'learn' : parts[2] === 'choir' ? 'choir' : 'song', id: parts[1] };
  return { view: 'list' };
}

export function LibraryPage() {
  const r = route();
  const [songs, setSongs] = useState(getSongs);
  const refresh = () => setSongs(getSongs());
  const saved = (id: string) => {
    refresh();
    window.location.hash = `#/songs/${id}`;
  };

  if (r.view === 'new') return <SongEditor onSaved={saved} />;
  if (r.view === 'edit' || r.view === 'song' || r.view === 'learn' || r.view === 'choir') {
    const song = songs.find((s) => s.id === r.id);
    if (!song)
      return (
        <Page title="الأغنية مش موجودة">
          <a href="#/songs">← رجوع للمكتبة</a>
        </Page>
      );
    if (r.view === 'edit') return <SongEditor song={song} onSaved={saved} />;
    if (r.view === 'learn') return <LearnSongPage song={song} />;
    if (r.view === 'choir') return <ChoirPage song={song} />;
    return <SongView song={song} onChanged={refresh} />;
  }
  return <SongList songs={songs} onChanged={refresh} />;
}

// ---------------------------------------------------------------- list

function SongList({ songs, onChanged }: { songs: Song[]; onChanged: () => void }) {
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState('');
  const [sort, setSort] = useState<SongSort>('recent');
  const [usage, setUsage] = useState('');
  const results = getResults();
  const list = filterSongs(songs, results, { query, tag: tag || undefined, sort });
  const filesBytes = songs.reduce((a, s) => a + (s.file?.size ?? 0) + (s.parts ?? []).reduce((b, p) => b + p.file.size, 0), 0);
  const weekly = getWeeklySong();

  useEffect(() => {
    void storageEstimate().then((e) => e && setUsage(`التطبيق مستخدم ${mb(e.usage)} من حوالي ${mb(e.quota)} متاحين على الجهاز ده.`));
  }, [songs.length]);

  const addExample = () => {
    const s = normalizeSong({ ...EXAMPLE_SONG });
    if (!saveSongs([...songs, s])) return;
    onChanged();
    window.location.hash = `#/songs/${s.id}`;
  };

  return (
    <Page help="songs" title="مكتبة أغانيّ" intro="أغانيكي في مكان واحد: لينك يوتيوب أو ملف صوت، السلم/المقام، الكلام والكوردات بتاعتك، ونتايجك في كل أغنية.">
      <div className="row lib-actions">
        <a className="button-link primary" href="#/songs/new">
          ➕ أغنية جديدة
        </a>
      </div>

      {songs.length === 0 ? (
        <div className="panel center empty-state">
          <div className="empty-icon">📚</div>
          <h2>المكتبة لسه فاضية</h2>
          <p>
            دوسي <b>➕ أغنية جديدة</b> واكتبي اسم الأغنية، وحطي لينك يوتيوب أو اختاري ملف صوت من الموبايل، واختاري سلمها (أو دوسي "اكتشف المقام"). بعدها بدوسة واحدة تفتحي "غني مع الأغنية" وكل حاجة جاهزة.
          </p>
          <button className="big" onClick={addExample}>
            ➕ ضيفي مثال: "احنا جنود ويسوعنا قائدنا" (صول ماجير)
          </button>
          <p className="hint">المثال من غير كلام — تقدري تضيفي لينك يوتيوب أو الكلام بتاعك بعدين.</p>
        </div>
      ) : (
        <>
          <div className="panel lib-tools">
            <input type="search" placeholder="🔎 دوري باسم الأغنية أو المغني" value={query} onChange={(e) => setQuery(e.target.value)} />
            <div className="choices">
              <button className={!tag ? 'chip active' : 'chip'} onClick={() => setTag('')}>
                الكل
              </button>
              {allTags(songs).map((t) => (
                <button key={t} className={t === tag ? 'chip active' : 'chip'} onClick={() => setTag(t === tag ? '' : t)}>
                  {t}
                </button>
              ))}
            </div>
            <label className="sort">
              ترتيب:{' '}
              <select value={sort} onChange={(e) => setSort(e.target.value as SongSort)}>
                <option value="recent">آخر تمرين</option>
                <option value="best">أحسن نتيجة</option>
                <option value="title">الاسم</option>
              </select>
            </label>
          </div>
          {list.length === 0 && <p className="hint">مفيش أغاني بالبحث ده.</p>}
          <ul className="song-list">
            {list.map((s) => {
              const st = songStats(results, s.id);
              return (
                <li key={s.id}>
                  <a href={`#/songs/${s.id}`} className="song-row">
                    <span className="song-title">
                      {s.id === weekly ? '⭐ ' : ''}
                      {s.title}
                    </span>
                    <span className="hint">
                      {[s.singer, keyLabelOf(s), s.file ? '🎵 ملف' : '', s.youtube ? '▶️ يوتيوب' : '', s.difficulty ? DIFFICULTY_AR[s.difficulty] : ''].filter(Boolean).join(' · ')}
                    </span>
                    <span className="song-score">{st.best !== null ? `أحسن ${st.best}%` : st.count ? `${st.count} تمرين` : 'لسه'}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <SongImportPanel onChanged={onChanged} />
      <p className="hint">
        ملفات الأغاني: {mb(filesBytes)}. {usage}
      </p>
    </Page>
  );
}

// ---------------------------------------------------------------- song page

function MiniLine({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const W = 300;
  const H = 70;
  const x = (i: number) => 10 + (i / (values.length - 1)) * (W - 20);
  const y = (v: number) => H - 8 - (v / 100) * (H - 16);
  return (
    <svg className="line-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="نتايج الأغنية مع الوقت">
      <polyline points={values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} />
      {values.map((v, i) => (
        <circle key={i} cx={x(i)} cy={y(v)} r={3.5}>
          <title>{`${v}%`}</title>
        </circle>
      ))}
    </svg>
  );
}

function SongView({ song, onChanged }: { song: Song; onChanged: () => void }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [weekly, setWeekly] = useState(getWeeklySong());
  const results = getResults();
  const st = songStats(results, song.id);
  const hard = recurringMoments(results, song.id);

  const removeFile = async () => {
    await deleteSongFile(song.id);
    saveSongs(getSongs().map((s) => (s.id === song.id ? { ...s, file: undefined, updatedAt: Date.now() } : s)));
    onChanged();
  };

  const remove = async () => {
    await deleteSongFile(song.id);
    for (const p of song.parts ?? []) await deleteSongFile(partKey(song.id, p.id));
    saveSongs(getSongs().filter((s) => s.id !== song.id));
    if (getWeeklySong() === song.id) setWeeklySong('');
    onChanged();
    window.location.hash = '#/songs';
  };

  const canSing = !!song.file || !!song.youtube;

  return (
    <Page title={song.title}>
      <p className="hint">{[song.singer, keyLabelOf(song), song.difficulty ? DIFFICULTY_AR[song.difficulty] : '', ...song.tags].filter(Boolean).join(' · ')}</p>

      <div className="panel center">
        {canSing ? (
          <div className="row">
            {song.file && (
              <button className="big primary" onClick={() => singSong(song, 'file')}>
                🎤 غني مع الملف
              </button>
            )}
            {song.youtube && (
              <button className={song.file ? 'big' : 'big primary'} onClick={() => singSong(song, 'youtube')}>
                ▶️ غني مع يوتيوب
              </button>
            )}
          </div>
        ) : (
          <p>
            ضيفي لينك يوتيوب أو ملف صوت عشان تقدري تغني مع الأغنية. <a href={`#/songs/${song.id}/edit`}>تعديل</a>
          </p>
        )}
        {song.file && (
          <a className="button-link" href={`#/songs/${song.id}/learn`}>
            🎓 تعلّمي الأغنية جملة جملة
            {(() => {
              const p = getPhraseProgress(song.id);
              return p ? ` (${p.phrases.filter((_, k) => (p.best[k] ?? 0) >= PHRASE_GOOD).length} من ${p.phrases.length} جمل)` : '';
            })()}
          </a>
        )}
        <button
          className={weekly === song.id ? 'chip active' : 'chip'}
          onClick={() => {
            setWeeklySong(song.id);
            setWeekly(song.id);
          }}
        >
          {weekly === song.id ? '⭐ أغنية الأسبوع' : '☆ اختاريها أغنية الأسبوع'}
        </button>
      </div>

      <div className="panel">
        <h2>نتايجك</h2>
        {st.count === 0 ? (
          <p className="hint">لسه متمرنتيش على الأغنية دي.</p>
        ) : (
          <>
            <div className="stats">
              <Stat label="أحسن نتيجة" value={st.best !== null ? `${st.best}%` : '—'} />
              <Stat label="آخر نتيجة" value={st.last !== null ? `${st.last}%` : '—'} />
              <Stat label="مرات التمرين" value={st.count} />
              {st.loops > 0 && <Stat label="منهم تكرار جملة" value={st.loops} />}
            </div>
            <MiniLine values={st.series.map((p) => p.value)} />
          </>
        )}
        {hard.length > 0 && (
          <>
            <h3>الحتت اللي بتتكرر صعوبتها</h3>
            <ul className="off-list">
              {hard.map((m, i) => (
                <li key={i} className="off-item">
                  <span className="hard-moment">
                    <span dir="ltr">
                      {fmtTime(m.start)}–{fmtTime(m.end)}
                    </span>{' '}
                    — في {m.sessions} مرات
                  </span>
                  {canSing && (
                    <button className="primary" onClick={() => singSong(song, song.file ? 'file' : 'youtube', m)}>
                      🔁 كرري الحتة دي
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <Options label={song.parts?.length ? `🎼 أصوات الكورال (${song.parts.length})` : '🎼 أصوات الكورال'} open={(song.parts?.length ?? 0) > 0}>
        <ChoirPartsPanel song={song} onChanged={onChanged} />
      </Options>

      {song.text && (
        <div className="panel">
          <h2>الكلام والكوردات</h2>
          <div className="song-text">
            {textLines(song.text).map((line, i) => (
              <div key={i} dir="auto">
                {line || ' '}
              </div>
            ))}
          </div>
        </div>
      )}
      {song.notes && (
        <div className="panel">
          <h2>ملاحظاتي</h2>
          <div className="song-text">
            {textLines(song.notes).map((line, i) => (
              <div key={i} dir="auto">
                {line || ' '}
              </div>
            ))}
          </div>
        </div>
      )}

      <Options label="📤 ابعتي الأغنية لحد">
        <SongExportPanel song={song} />
      </Options>
      <div className="panel">
        {song.file ? (
          <p>
            🎵 الملف: {song.file.name} ({mb(song.file.size)}){' '}
            <button className="link danger" onClick={removeFile}>
              شيلي الملف
            </button>
          </p>
        ) : (
          <p className="hint">مفيش ملف صوت متخزن للأغنية دي.</p>
        )}
        <div className="row">
          <a className="button-link" href={`#/songs/${song.id}/edit`}>
            ✏️ تعديل
          </a>
          <button className="danger" onClick={() => setConfirmDelete(true)}>
            🗑️ امسحي الأغنية
          </button>
        </div>
        {confirmDelete && (
          <div className="confirm-box" role="alertdialog" aria-label="تأكيد مسح الأغنية">
            <p>
              {g('متأكدة إنك عايزة تمسحي', 'متأكد إنك عايز تمسح')} <b>{song.title}</b>
              {song.file ? ' وملف الصوت بتاعها' : ''}؟ نتايجك القديمة هتفضل في صفحة التقدم.
            </p>
            <div className="row">
              <button className="primary" onClick={remove}>
                أيوه امسحيها
              </button>
              <button onClick={() => setConfirmDelete(false)}>لأ</button>
            </div>
          </div>
        )}
      </div>
    </Page>
  );
}

// ---------------------------------------------------------------- add / edit

function SongEditor({ song, onSaved }: { song?: Song; onSaved: (id: string) => void }) {
  const [d, setD] = useState<Partial<Song>>(() => song ?? { tags: [] });
  const [file, setFile] = useState<File | null>(null);
  const [removeFile, setRemoveFile] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [detect, setDetect] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const set = <K extends keyof Song>(k: K, v: Song[K] | undefined) => setD((x) => ({ ...x, [k]: v }));
  const tags = d.tags ?? [];

  const save = async () => {
    const draft = { ...d, tags: tagInput.trim() ? [...tags, tagInput.trim()] : tags };
    const errs = validateSong(draft);
    if (file && file.size > MAX_FILE) errs.push('الملف كبير قوي (أكتر من ٦٠ ميجا). اختاري ملف أصغر أو استخدمي لينك يوتيوب.');
    setErrors(errs);
    if (errs.length) return;
    setSaving(true);
    const s = normalizeSong(draft as Partial<Song> & { title: string });
    if (file) {
      const res = await saveSongFile({ songId: s.id, name: file.name, type: file.type || 'audio/mpeg', bytes: await file.arrayBuffer() });
      if (!res.ok) {
        setSaving(false);
        return setErrors([res.error]);
      }
      s.file = { name: file.name, type: file.type || 'audio/mpeg', size: file.size };
    } else if (removeFile) {
      await deleteSongFile(s.id);
      s.file = undefined;
    }
    const list = getSongs();
    const next = list.some((x) => x.id === s.id) ? list.map((x) => (x.id === s.id ? s : x)) : [...list, s];
    if (!saveSongs(next)) {
      setSaving(false);
      return setErrors(['معرفناش نحفظ الأغنية (مساحة المتصفح خلصت). امسحي حاجة وجربي تاني.']);
    }
    setSaving(false);
    onSaved(s.id);
  };

  return (
    <Page title={song ? `تعديل: ${song.title}` : 'أغنية جديدة'}>
      <div className="panel form">
        <label>
          اسم الأغنية *
          <input value={d.title ?? ''} onChange={(e) => set('title', e.target.value)} />
        </label>
        <label>
          المغني (اختياري)
          <input value={d.singer ?? ''} onChange={(e) => set('singer', e.target.value)} />
        </label>
        <label>
          لينك يوتيوب (اختياري)
          <input type="url" dir="ltr" inputMode="url" placeholder="https://youtu.be/..." value={d.youtube ?? ''} onChange={(e) => set('youtube', e.target.value)} />
        </label>
        <label>
          ملف صوت مرجعي (اختياري — بيتحفظ على الجهاز ده)
          {d.file && !removeFile && !file && (
            <span className="hint">
              متخزن: {d.file.name} ({mb(d.file.size)}){' '}
              <button type="button" className="link danger" onClick={() => setRemoveFile(true)}>
                شيليه
              </button>
            </span>
          )}
          <input
            type="file"
            accept="audio/*"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setRemoveFile(false);
            }}
          />
        </label>

        <div className="key-row">
          <span>السلم/المقام:</span>
          <select aria-label="القرار" value={d.tonic ?? ''} onChange={(e) => set('tonic', e.target.value === '' ? undefined : Number(e.target.value))}>
            <option value="">—</option>
            {Array.from({ length: 24 }, (_, i) => i / 2).map((t) => (
              <option key={t} value={t}>
                {tonicName(t).name} — {tonicName(t).ar}
              </option>
            ))}
          </select>
          <select aria-label="نوع السلم أو المقام" value={d.scaleId ?? ''} onChange={(e) => set('scaleId', e.target.value || undefined)}>
            <option value="">—</option>
            {SCALES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.ar}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => setDetect((x) => !x)}>
            🔎 اكتشف المقام
          </button>
        </div>
        {detect && (
          <KeyDetector
            onUse={(t, id) => {
              setD((x) => ({ ...x, tonic: t, scaleId: id }));
              setDetect(false);
            }}
          />
        )}

        <div>
          <span>التصنيف:</span>
          <div className="choices">
            {[...new Set([...SUGGESTED_TAGS, ...tags])].map((t) => (
              <button type="button" key={t} className={tags.includes(t) ? 'chip active' : 'chip'} onClick={() => set('tags', tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t])}>
                {t}
              </button>
            ))}
            <input className="tag-input" placeholder="تصنيف تاني…" value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => {
              if (e.key === 'Enter' && tagInput.trim()) {
                set('tags', [...tags, tagInput.trim()]);
                setTagInput('');
              }
            }} />
          </div>
        </div>

        <div>
          <span>الصعوبة:</span>
          <div className="choices">
            {([1, 2, 3] as const).map((n) => (
              <button type="button" key={n} className={d.difficulty === n ? 'chip active' : 'chip'} onClick={() => set('difficulty', d.difficulty === n ? undefined : n)}>
                {DIFFICULTY_AR[n]}
              </button>
            ))}
          </div>
        </div>

        <label>
          الكلام أو الكوردات (اختياري — اكتبيه أو الصقيه بنفسك)
          <textarea dir="auto" rows={8} value={d.text ?? ''} onChange={(e) => set('text', e.target.value)} placeholder={'G        D\nسطر من الكلام…'} />
        </label>
        <label>
          ملاحظاتي (اختياري)
          <textarea dir="auto" rows={3} value={d.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
        </label>

        {errors.map((e) => (
          <ErrorText key={e} text={e} />
        ))}
        <button className="big primary" disabled={saving} onClick={save}>
          {saving ? 'بنحفظ…' : '💾 احفظي'}
        </button>
      </div>
    </Page>
  );
}
