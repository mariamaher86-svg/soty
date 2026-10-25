// "بياناتك": export everything to one file and restore it on another device.

import { useEffect, useState } from 'react';
import { ErrorText, Options } from './ui';
import { HomeScreenNote } from './BeforeTraining';
import { Help } from './Help';
import { showWelcomeAgain } from './Welcome';
import { noiseCheckOn, setNoiseCheck } from '../lib/noise';
import { listTeacher, saveTeacher, clearTeacher } from '../audio/teacherStore';
import { applyAppStorage, getSongs, readAppStorage, saveSongs } from '../lib/storage';
import { deleteSongFile, listSongFiles, mb, saveSongFile } from '../audio/songFiles';
import { partKey, songIdOfKey } from '../lib/choir';
import { backupFileName, base64ToBytes, base64ToFloat, buildBackup, describeBackup, estimateBackupBytes, planSongFiles, planStorage, planTeacher, validateBackup, type Backup } from '../lib/backup';

const DONE_FLAG = 'soty.backup.restored';

export function BackupSection() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [pending, setPending] = useState<Backup | null>(null);
  const [shareFile, setShareFile] = useState<File | null>(null);
  const [withAudio, setWithAudio] = useState(true);
  const [sizes, setSizes] = useState<{ full: number; small: number } | null>(null);

  // estimated file size with / without the song audio files
  useEffect(() => {
    void listTeacher().then((t) => {
      const storage = readAppStorage();
      const teacher = t.map((x) => x.data.length);
      const files = getSongs().map((x) => x.file?.size ?? 0).filter((n) => n > 0);
      setSizes({ full: estimateBackupBytes(storage, teacher, files), small: estimateBackupBytes(storage, teacher, []) });
    });
  }, []);

  // message after the page reloads with restored data
  useEffect(() => {
    try {
      if (sessionStorage.getItem(DONE_FLAG)) {
        setMsg(sessionStorage.getItem(DONE_FLAG)!);
        sessionStorage.removeItem(DONE_FLAG);
      }
    } catch {
      // ignore
    }
  }, []);

  const exportFile = async () => {
    setErr('');
    setMsg('');
    setBusy(true);
    try {
      const files = withAudio ? (await listSongFiles()).map((f) => ({ songId: f.songId, name: f.name, type: f.type, bytes: new Uint8Array(f.bytes) })) : undefined;
      const backup = buildBackup(readAppStorage(), await listTeacher(), new Date(), files);
      const file = new File([JSON.stringify(backup)], backupFileName(), { type: 'application/json' });
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      setMsg(`اتحفظ الملف ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} ميجا) في التنزيلات.`);
      // offer the share sheet too (send it to yourself), where the browser supports sharing files
      if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) setShareFile(file);
    } catch (e) {
      setErr('معرفناش نعمل الملف: ' + String(e));
    }
    setBusy(false);
  };

  const share = async () => {
    if (!shareFile) return;
    try {
      await navigator.share({ files: [shareFile], title: 'نسخة احتياطية من صوتي' });
    } catch {
      // cancelled
    }
  };

  const pickFile = async (file: File | undefined) => {
    setErr('');
    setMsg('');
    setPending(null);
    if (!file) return;
    let json: unknown;
    try {
      json = JSON.parse(await file.text());
    } catch {
      return setErr('الملف ده مش نسخة احتياطية سليمة من صوتي: محتواه مش مفهوم.');
    }
    const v = validateBackup(json);
    if (!v.ok) return setErr(v.error);
    setPending(v.backup);
  };

  const restore = async (mode: 'replace' | 'merge') => {
    if (!pending) return;
    setBusy(true);
    const plan = planStorage(readAppStorage(), pending, mode);
    if (!applyAppStorage(plan.set, plan.remove)) {
      setBusy(false);
      return setErr('المتصفح رفض يحفظ البيانات (ممكن يكون وضع التصفح الخاص أو المساحة خلصت). مفيش حاجة اتغيرت.');
    }
    if (mode === 'replace') await clearTeacher();
    const existing = mode === 'merge' ? (await listTeacher()).map((t) => t.createdAt) : [];
    let failed = 0;
    for (const t of planTeacher(existing, pending, mode)) {
      const ok = await saveTeacher({ freq: t.freq, sampleRate: t.sampleRate, createdAt: t.createdAt, data: base64ToFloat(t.audio), target: t.target, syllable: t.syllable });
      if (!ok) failed++;
    }
    // song audio files: drop files of songs that are gone, add the backup's files, then make the song list match what's stored
    const songs = getSongs();
    const ids = new Set(songs.map((x) => x.id));
    const stored = await listSongFiles();
    for (const f of stored) if (!ids.has(songIdOfKey(f.songId))) await deleteSongFile(f.songId); // part files are keyed song::part
    let fileFailed = 0;
    for (const f of planSongFiles(mode === 'merge' ? stored.map((x) => x.songId) : [], pending, mode)) {
      const res = await saveSongFile({ songId: f.songId, name: f.name, type: f.type, bytes: base64ToBytes(f.data).buffer as ArrayBuffer });
      if (!res.ok) fileFailed++;
    }
    const nowStored = new Map((await listSongFiles()).map((f) => [f.songId, f]));
    saveSongs(
      songs.map((x) => {
        const f = nowStored.get(x.id);
        const parts = (x.parts ?? []).filter((p) => nowStored.has(partKey(x.id, p.id))); // keep parts whose audio is here
        return { ...x, file: f ? { name: f.name, type: f.type, size: f.bytes.byteLength } : undefined, parts: parts.length ? parts : undefined };
      }),
    );
    try {
      const problems = [failed ? `${failed} من تسجيلات المعلم` : '', fileFailed ? `${fileFailed} من ملفات الأغاني (المساحة خلصت)` : ''].filter(Boolean).join(' و');
      sessionStorage.setItem(DONE_FLAG, problems ? `البيانات رجعت ✔ بس ${problems} متحفظتش.` : 'البيانات رجعت ✔');
    } catch {
      // ignore
    }
    window.location.reload(); // every page re-reads the restored data
  };

  const info = pending ? describeBackup(pending) : null;

  return (
    <div className="panel">
      <h2>💾 بياناتك</h2>
      <Help id="backup" />
      <p className="hint">بياناتك على الجهاز ده بس. صدّريها في ملف عشان تنقليها أو تحتفظي بنسخة. الملف فيه تسجيلات صوتك، فخليه ليكي إنتي بس.</p>
      <Options label="📲 الآيفون والشاشة الرئيسية">
        <HomeScreenNote />
      </Options>
      <ErrorText text={err} />
      {msg && <p className="ok-text">{msg}</p>}

      <div className="choices">
        <button className={withAudio ? 'chip active' : 'chip'} onClick={() => setWithAudio(true)}>
          كاملة مع ملفات الأغاني{sizes ? ` (~${mb(sizes.full)})` : ''}
        </button>
        <button className={!withAudio ? 'chip active' : 'chip'} onClick={() => setWithAudio(false)}>
          بدون ملفات الصوت{sizes ? ` (~${mb(sizes.small)})` : ''}
        </button>
      </div>
      {!withAudio && <p className="hint">من غير ملفات صوت الأغاني (تسجيلات المعلم الصغيرة بتتحفظ). الأغاني نفسها ونتايجها بتتحفظ، والملفات تختاريها تاني على الجهاز التاني.</p>}
      <div className="row">
        <button className="primary" disabled={busy} onClick={exportFile}>
          ⬇️ صدّري بياناتك
        </button>
        {shareFile && <button onClick={share}>📤 ابعتيه لنفسك</button>}
        <label className="file-button">
          ⬆️ استرجعي بياناتك
          <input
            type="file"
            accept="application/json,.json"
            disabled={busy}
            onChange={(e) => {
              void pickFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </label>
      </div>

      {pending && info && (
        <div className="confirm-box" role="alertdialog" aria-label="تأكيد استرجاع البيانات">
          <p>
            <b>نسخة من يوم {info.date}</b>: {info.results} نتيجة، {info.songs} أغنية ({info.songFiles} ملف صوت)، و{info.recordings} تسجيل للمعلم.
          </p>
          <p>
            <b>استبدال</b> = البيانات اللي على الجهاز ده هتتمسح ويحل مكانها اللي في الملف.
            <br />
            <b>دمج</b> = النتايج والقياسات والأغاني من الاتنين تتجمع مع بعض (الأغنية اللي اتعدلت آخر مرة هي اللي بتفضل)، والإعدادات تيجي من الملف.
          </p>
          <div className="row">
            <button className="primary" disabled={busy} onClick={() => restore('replace')}>
              استبدلي
            </button>
            <button disabled={busy} onClick={() => restore('merge')}>
              ادمجي
            </button>
            <button className="link" disabled={busy} onClick={() => setPending(null)}>
              إلغاء
            </button>
          </div>
        </div>
      )}
      <p>
        <button
          className="link"
          onClick={() => {
            showWelcomeAgain();
            window.location.hash = '#/';
            window.location.reload();
          }}
        >
          👋 عرض الترحيب تاني
        </button>
      </p>
    </div>
  );
}

/** Turns the "🔇 دوشة المكان" check (before mic exercises) on or off. */
export function NoiseSetting() {
  const [on, setOn] = useState(noiseCheckOn);
  return (
    <label className="check-row">
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => {
          setNoiseCheck(e.target.checked);
          setOn(e.target.checked);
        }}
      />
      🔇 فحص دوشة المكان قبل تمارين المايك
    </label>
  );
}
