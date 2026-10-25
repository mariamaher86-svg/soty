// "📤 صدّري الأغنية" (song page) and "📥 استوردي أغنية" (library list).

import { useState } from 'react';
import { ErrorText } from './ui';
import { deleteSongFile, getSongFile, mb, saveSongFile } from '../audio/songFiles';
import { partKey } from '../lib/choir';
import { getSongs, saveSongs, setPref } from '../lib/storage';
import { newSongId, type Song } from '../lib/songs';
import { buildSongPackage, estimateSongPackageBytes, findExistingSong, planSongImport, songPackageFileName, validateSongPackage, type SongPackage } from '../lib/songShare';
import { getPhraseProgress } from '../pages/LearnSongPage';

const hasAudio = (s: Song) => !!s.file || !!s.parts?.length;

export function SongExportPanel({ song }: { song: Song }) {
  const [withAudio, setWithAudio] = useState(hasAudio(song));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [shareFile, setShareFile] = useState<File | null>(null);

  const exportSong = async () => {
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      let files: { part: string | null; name: string; type: string; bytes: Uint8Array }[] | null = null;
      if (withAudio) {
        files = [];
        const want: [string | null, string][] = [...(song.file ? [[null, song.id] as [null, string]] : []), ...(song.parts ?? []).map((p) => [p.id, partKey(song.id, p.id)] as [string, string])];
        for (const [part, key] of want) {
          const f = await getSongFile(key);
          if (f) files.push({ part, name: f.name, type: f.type, bytes: new Uint8Array(f.bytes) });
        }
      }
      const pkg = buildSongPackage(song, getPhraseProgress(song.id)?.phrases ?? null, files);
      const file = new File([JSON.stringify(pkg)], songPackageFileName(song), { type: 'application/json' });
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      setMsg(`اتحفظ ${file.name} (${mb(file.size)}) في التنزيلات.`);
      if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) setShareFile(file);
    } catch (e) {
      setErr('معرفناش نعمل الملف: ' + String(e));
    }
    setBusy(false);
  };

  const share = async () => {
    if (!shareFile) return;
    try {
      await navigator.share({ files: [shareFile], title: song.title });
    } catch {
      // cancelled
    }
  };

  return (
    <div className="panel">
      <h2>📤 ابعتي الأغنية</h2>
      <p className="hint">ملف واحد فيه بيانات الأغنية، السلم، الكلام والكوردات، الجمل{hasAudio(song) ? '، والصوت وأصوات الكورال' : ''} — من غير نتايجك. يتفتح من «📥 استوردي أغنية» في المكتبة.</p>
      {hasAudio(song) && (
        <div className="choices">
          <button className={withAudio ? 'chip active' : 'chip'} onClick={() => setWithAudio(true)}>
            مع ملفات الصوت (حوالي {mb(estimateSongPackageBytes(song, true))})
          </button>
          <button className={!withAudio ? 'chip active' : 'chip'} onClick={() => setWithAudio(false)}>
            من غير صوت (حوالي {mb(estimateSongPackageBytes(song, false))})
          </button>
        </div>
      )}
      <div className="row">
        <button onClick={exportSong} disabled={busy}>
          {busy ? '…' : '📤 صدّري الأغنية'}
        </button>
        {shareFile && <button onClick={share}>📨 ابعتيها</button>}
      </div>
      {msg && <p className="ok-text">{msg}</p>}
      <ErrorText text={err} />
    </div>
  );
}

export function SongImportPanel({ onChanged }: { onChanged: () => void }) {
  const [pending, setPending] = useState<{ pkg: SongPackage; existing: Song } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const apply = async (pkg: SongPackage, existing: Song | null, mode: 'keep' | 'replace') => {
    setBusy(true);
    setPending(null);
    const plan = planSongImport(pkg, existing, mode, newSongId());
    for (const k of plan.remove) await deleteSongFile(k);
    let song = plan.song;
    for (const f of plan.files) {
      const r = await saveSongFile({ songId: f.key, name: f.name, type: f.type, bytes: f.bytes.slice().buffer });
      if (!r.ok) {
        setErr(r.error + ' — الأغنية اتضافت من غير ملفات الصوت.');
        song = { ...song, file: undefined, parts: undefined };
        break;
      }
    }
    const others = getSongs().filter((s) => s.id !== song.id);
    if (!saveSongs([...others, song])) setErr('معرفناش نحفظ الأغنية في المتصفح ده.');
    else {
      if (plan.phrases) setPref('phrases.' + song.id, JSON.stringify({ phrases: plan.phrases, best: {} }));
      setMsg(`✔ اتضافت: ${song.title}`);
      onChanged();
    }
    setBusy(false);
  };

  const pick = async (file: File | undefined) => {
    setErr('');
    setMsg('');
    setPending(null);
    if (!file) return;
    let json: unknown;
    try {
      json = JSON.parse(await file.text());
    } catch {
      return setErr('الملف ده مش ملف أغنية من صوتي.');
    }
    const v = validateSongPackage(json);
    if (!v.ok) return setErr(v.error);
    const existing = findExistingSong(getSongs(), v.pkg.song);
    if (existing) setPending({ pkg: v.pkg, existing });
    else await apply(v.pkg, null, 'keep');
  };

  return (
    <div className="panel">
      <h2>📥 استوردي أغنية</h2>
      <p className="hint">ملف أغنية اتبعتلك من صوتي (من «📤 صدّري الأغنية»).</p>
      <label className="file">
        <span>اختاري ملف الأغنية</span>
        <input type="file" accept=".json,application/json" disabled={busy} onChange={(e) => void pick(e.target.files?.[0])} />
      </label>
      {pending && (
        <div className="confirm-box" role="alertdialog" aria-label="الأغنية موجودة">
          <p>
            الأغنية <b>{pending.existing.title}</b> موجودة عندك قبل كده. تعملي إيه؟
          </p>
          <div className="row">
            <button onClick={() => void apply(pending.pkg, pending.existing, 'keep')}>احتفظي بالاتنين</button>
            <button className="danger" onClick={() => void apply(pending.pkg, pending.existing, 'replace')}>
              استبدلي القديمة
            </button>
            <button onClick={() => setPending(null)}>إلغاء</button>
          </div>
          <p className="hint">الاستبدال بيغيّر بيانات الأغنية وملفاتها، ونتايجك القديمة فيها بتفضل.</p>
        </div>
      )}
      {busy && <p className="hint">بنحفظ…</p>}
      {msg && <p className="ok-text">{msg}</p>}
      <ErrorText text={err} />
    </div>
  );
}
