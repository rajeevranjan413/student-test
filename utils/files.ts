// Server-only helpers for the per-item file child tables (`study_material_files`,
// `homework_files`) introduced in DECISIONS D28 to let one note / one file-homework
// own SEVERAL PDFs/images. List APIs read public file metadata; the download/delete
// paths read the storage internals (provider + path) needed to sign or remove bytes.
//
// The parent's authorization is enforced by the CALLER before any download is minted
// — these helpers only fetch rows. They accept whatever Supabase client the caller
// passes: the request-scoped (RLS) client for list reads, or the service-role admin
// client for download/delete (which must see the storage internals regardless of RLS).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { StoredFileMeta } from "./studyMaterial";
import { toStoredFile, type StoredFile } from "./storage";

export type FileTable = "study_material_files" | "homework_files";

/** The parent foreign-key column for each file table. */
const PARENT_FK: Record<FileTable, string> = {
  study_material_files: "material_id",
  homework_files: "homework_id",
};

/**
 * Public file metadata (no storage internals) grouped by parent id, each parent's
 * files in display order. Used by the list/detail APIs to attach `files[]` to a row.
 */
export async function filesByParent(
  client: SupabaseClient,
  table: FileTable,
  parentIds: string[]
): Promise<Map<string, StoredFileMeta[]>> {
  const map = new Map<string, StoredFileMeta[]>();
  if (parentIds.length === 0) return map;
  const fk = PARENT_FK[table];

  const { data, error } = await client
    .from(table)
    .select(`id, ${fk}, file_name, file_size, mime_type, order`)
    .in(fk, parentIds)
    .order("order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;

  for (const r of (data ?? []) as unknown as Record<string, unknown>[]) {
    const pid = r[fk] as string;
    const list = map.get(pid) ?? [];
    list.push({
      id: r.id as string,
      file_name: r.file_name as string,
      file_size: (r.file_size as number | null) ?? null,
      mime_type: (r.mime_type as string | null) ?? null,
    });
    map.set(pid, list);
  }
  return map;
}

/** Convenience: the ordered file metadata for a SINGLE parent. */
export async function filesForParent(
  client: SupabaseClient,
  table: FileTable,
  parentId: string
): Promise<StoredFileMeta[]> {
  return (await filesByParent(client, table, [parentId])).get(parentId) ?? [];
}

/**
 * All stored-file references (provider + path) for the given parents — for bulk
 * deletion of the underlying bytes before the DB rows cascade away. Reads via the
 * passed client (use the admin client so it isn't RLS-limited).
 */
export async function storedFilesForParents(
  client: SupabaseClient,
  table: FileTable,
  parentIds: string[]
): Promise<StoredFile[]> {
  if (parentIds.length === 0) return [];
  const fk = PARENT_FK[table];
  const { data, error } = await client
    .from(table)
    .select(`storage_provider, file_path`)
    .in(fk, parentIds);
  if (error) throw error;
  return (data ?? [])
    .filter((r) => !!r.file_path)
    .map((r) => toStoredFile(r.storage_provider as string, r.file_path as string));
}

/**
 * Resolve which file a download request targets: the specific `fileId` when given
 * (verified to belong to `parentId`), otherwise the parent's first file. Returns the
 * stored reference + original filename, or null if there's no such file. Reads via
 * the admin client (needs storage internals). Authorization on the PARENT is the
 * caller's responsibility and must already have passed.
 */
export async function resolveDownloadFile(
  admin: SupabaseClient,
  table: FileTable,
  parentId: string,
  fileId: string | null
): Promise<{ file: StoredFile; fileName: string } | null> {
  const fk = PARENT_FK[table];
  let query = admin
    .from(table)
    .select(`id, ${fk}, storage_provider, file_path, file_name, order`)
    .eq(fk, parentId);

  if (fileId) query = query.eq("id", fileId);
  else query = query.order("order", { ascending: true }).order("created_at", { ascending: true });

  const { data, error } = await query.limit(1);
  if (error) throw error;
  const row = (data ?? [])[0] as unknown as Record<string, unknown> | undefined;
  if (!row || !row.file_path) return null;

  return {
    file: toStoredFile(row.storage_provider as string, row.file_path as string),
    fileName: (row.file_name as string) || "file",
  };
}
