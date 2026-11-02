// The SyncBackend (lib/sync.ts) on her Supabase project: table "soty_docs" + private bucket "soty-files".
// Every row and file is hers only (Row Level Security / storage policies in supabase/schema.sql).

import type { SupabaseClient } from '@supabase/supabase-js';
import { storagePath, type RemoteDoc, type RemoteFile, type SyncBackend } from '../lib/sync';

export const BUCKET = 'soty-files';
const TABLE = 'soty_docs';
const FOLDERS = ['teacher', 'songs'];

export function supabaseBackend(sb: SupabaseClient, userId: string): SyncBackend {
  const fail = (e: { message?: string } | null) => {
    if (e) throw new Error(e.message ?? 'sync failed');
  };
  const listAll = async (prefix: string): Promise<RemoteFile[]> => {
    // folders: teacher/<file>, songs/<key>/<file>
    const out: RemoteFile[] = [];
    const walk = async (dir: string, depth: number) => {
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await sb.storage.from(BUCKET).list(storagePath(userId, dir), { limit: 1000, offset });
        fail(error);
        for (const item of data ?? []) {
          const path = `${dir}/${item.name}`;
          if (item.id === null && depth > 0) await walk(path, depth - 1); // a folder
          else if (item.id !== null) out.push({ path, size: (item.metadata as { size?: number } | null)?.size ?? 0 });
        }
        if (!data || data.length < 1000) break;
      }
    };
    await walk(prefix, prefix === 'songs' ? 1 : 0);
    return out;
  };

  return {
    async getDocs() {
      const { data, error } = await sb.from(TABLE).select('key,value,updated_at');
      fail(error);
      return (data ?? []) as RemoteDoc[];
    },
    async putDocs(docs) {
      const { data, error } = await sb
        .from(TABLE)
        .upsert(docs.map((d) => ({ user_id: userId, key: d.key, value: d.value })), { onConflict: 'user_id,key' })
        .select('key,value,updated_at');
      fail(error);
      return (data ?? []) as RemoteDoc[];
    },
    async deleteAll() {
      const files = (await Promise.all(FOLDERS.map(listAll))).flat();
      for (let i = 0; i < files.length; i += 100) {
        const { error } = await sb.storage.from(BUCKET).remove(files.slice(i, i + 100).map((f) => storagePath(userId, f.path)));
        fail(error);
      }
      const { error } = await sb.from(TABLE).delete().eq('user_id', userId);
      fail(error);
    },
    async listFiles() {
      return (await Promise.all(FOLDERS.map(listAll))).flat();
    },
    async upload(path, bytes, contentType) {
      const { error } = await sb.storage.from(BUCKET).upload(storagePath(userId, path), bytes, { contentType, upsert: true });
      fail(error);
    },
    async download(path) {
      const { data, error } = await sb.storage.from(BUCKET).download(storagePath(userId, path));
      fail(error);
      return { bytes: new Uint8Array(await data!.arrayBuffer()), contentType: data!.type || 'application/octet-stream' };
    },
    async removeFiles(paths) {
      if (!paths.length) return;
      const { error } = await sb.storage.from(BUCKET).remove(paths.map((p) => storagePath(userId, p)));
      fail(error);
    },
  };
}
