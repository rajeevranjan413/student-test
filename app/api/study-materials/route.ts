import { NextResponse } from "next/server";
import { AuthError, requireTeacher } from "@/utils/auth";
import {
  ACCEPTED_MIMES,
  MAX_FILE_BYTES,
  MAX_FILE_LABEL,
  MAX_FILES_PER_ITEM,
  STUDY_BUCKET,
  extForUpload,
  isAcceptedFile,
} from "@/utils/studyMaterial";
import {
  copyObject,
  headObject,
  removeObjects,
  toStoredFile,
  type StoredFile,
} from "@/utils/storage";
import { filesByParent } from "@/utils/files";
import { notifyBatchStudents } from "@/utils/push";

function handleError(error: unknown) {
  if (error instanceof AuthError)
    return NextResponse.json({ error: error.message }, { status: error.status });
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Unknown error" },
    { status: 500 }
  );
}

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function mapRow(
  m: Record<string, unknown>,
  filesById: Map<string, import("@/utils/studyMaterial").StoredFileMeta[]>
) {
  const batches = m.batches as { name?: string } | { name?: string }[] | null;
  const batchName = Array.isArray(batches) ? batches[0]?.name : batches?.name;
  const id = m.id as string;
  return {
    id,
    subject_id: (m.subject_id as string | null) ?? null,
    batch_id: m.batch_id as string,
    batch_name: batchName ?? null,
    kind: m.kind as string,
    title: m.title as string,
    description: (m.description as string | null) ?? null,
    files: filesById.get(id) ?? [],
    created_at: m.created_at as string,
  };
}

// GET /api/study-materials — the teacher's notes (optional ?subject= / ?batch=).
export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireTeacher();
    const url = new URL(request.url);
    const subjectId = url.searchParams.get("subject");
    const batchId = url.searchParams.get("batch");

    let query = supabase
      .from("study_materials")
      .select(
        "id, subject_id, batch_id, kind, title, description, file_name, file_size, mime_type, created_at, batches(name)"
      )
      .eq("teacher_id", user.id)
      .is("archived_at", null)
      .order("created_at", { ascending: false });

    if (subjectId) query = query.eq("subject_id", subjectId);
    if (batchId) query = query.eq("batch_id", batchId);

    const { data, error } = await query;
    if (error) throw error;

    const rows = data ?? [];
    const filesById = await filesByParent(
      supabase,
      "study_material_files",
      rows.map((r) => r.id as string)
    );
    return NextResponse.json(rows.map((r) => mapRow(r, filesById)));
  } catch (error) {
    return handleError(error);
  }
}

// POST /api/study-materials — file one or MORE PDF/image notes under a subject. The
// bytes were already uploaded DIRECTLY to R2 by the browser via presigned PUT URLs
// (D35); this JSON finalize step records the rows. Several files become a single note
// owning many files (D28) — the parent row holds the title/description, each file a
// child row.
//
// Multi-batch (D33): an optional `batchIds` list also files the note into a
// **same-named subject in each selected batch** (created when missing). The origin
// subject is always included; the uploaded objects are COPIED server-side (R2→R2, no
// bytes through this server) per extra target.
type IncomingUpload = { key?: string; name?: string; size?: number; type?: string };

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireTeacher();

    const body = await request.json().catch(() => ({}));
    const title = String(body?.title ?? "").trim();
    const description = String(body?.description ?? "").trim();
    const subjectId = String(body?.subjectId ?? "").trim();
    const extraBatchIds: string[] = Array.isArray(body?.batchIds)
      ? body.batchIds.map((b: unknown) => String(b).trim()).filter(Boolean)
      : [];
    const uploads: IncomingUpload[] = Array.isArray(body?.files) ? body.files : [];

    // --- Validation ---
    if (!title) return bad("A title is required.");
    if (!subjectId) return bad("A subject must be selected.");
    if (uploads.length === 0) return bad("At least one PDF or image file is required.");
    if (uploads.length > MAX_FILES_PER_ITEM)
      return bad(`You can attach up to ${MAX_FILES_PER_ITEM} files at once.`);
    for (const u of uploads) {
      const fileName = (u.name || "").trim() || "notes";
      if (!u.key || typeof u.key !== "string")
        return bad(`"${fileName}": upload was not completed.`);
      if (!isAcceptedFile(u.type || "", fileName))
        return bad(`"${fileName}": only PDF or image files are allowed.`);
    }

    // Resolve the origin subject → its batch + name, and verify ownership.
    const { data: subject, error: subjErr } = await supabase
      .from("subjects")
      .select("id, batch_id, teacher_id, name")
      .eq("id", subjectId)
      .maybeSingle();
    if (subjErr) throw subjErr;
    if (!subject) return bad("Selected subject was not found.", 404);
    if (subject.teacher_id !== user.id)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const originBatchId = subject.batch_id as string;
    const subjectName = subject.name as string;

    // Build the set of TARGET (batchId → subjectId) pairs. The origin batch uses the
    // origin subject; every other selected batch resolves a same-named subject
    // (created if missing) — verifying the teacher owns each batch first (D33).
    const targets: { batchId: string; subjectId: string }[] = [
      { batchId: originBatchId, subjectId },
    ];
    const otherBatchIds = Array.from(
      new Set(extraBatchIds.filter((b) => b !== originBatchId))
    );

    if (otherBatchIds.length > 0) {
      const { data: batchRows, error: batchErr } = await supabase
        .from("batches")
        .select("id, teacher_id")
        .in("id", otherBatchIds);
      if (batchErr) throw batchErr;
      const ownedBatches = batchRows ?? [];
      if (ownedBatches.length !== otherBatchIds.length)
        return bad("A selected batch was not found.", 404);
      if (ownedBatches.some((b) => b.teacher_id !== user.id))
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });

      for (const bId of otherBatchIds) {
        // Find a live, teacher-owned subject with the same name in this batch (take
        // the earliest if a batch happens to have duplicate-named folders)…
        const { data: existing, error: findErr } = await supabase
          .from("subjects")
          .select("id")
          .eq("batch_id", bId)
          .eq("teacher_id", user.id)
          .eq("name", subjectName)
          .is("archived_at", null)
          .order("created_at", { ascending: true })
          .limit(1);
        if (findErr) throw findErr;

        let targetSubjectId = existing?.[0]?.id as string | undefined;
        if (!targetSubjectId) {
          // …or create it so the note has a folder to live in.
          const { data: made, error: makeErr } = await supabase
            .from("subjects")
            .insert({ batch_id: bId, teacher_id: user.id, name: subjectName })
            .select("id")
            .single();
          if (makeErr) throw makeErr;
          targetSubjectId = made.id as string;
        }
        targets.push({ batchId: bId, subjectId: targetSubjectId });
      }
    }

    // Verify each browser-uploaded object: it MUST live under this subject's origin
    // prefix (a key the sign route minted for this subject) and actually exist in R2.
    // HEAD gives the authoritative size (trusted over the client-reported one).
    const originPrefix = `${STUDY_BUCKET}/${originBatchId}/${subjectId}/`;
    const sources: {
      file: StoredFile;
      fileName: string;
      storedMime: string;
      size: number;
    }[] = [];
    for (const u of uploads) {
      const fileName = (u.name || "").trim() || "notes";
      const key = u.key as string;
      if (!key.startsWith(originPrefix))
        return bad(`"${fileName}": upload key does not match the selected subject.`);
      const mime = u.type || "";
      const storedMime = (ACCEPTED_MIMES as readonly string[]).includes(mime)
        ? mime
        : "application/pdf";
      const file = toStoredFile("r2", key);
      const head = await headObject(file);
      if (!head) return bad(`"${fileName}": the upload was not found — please retry.`);
      if (head.size > MAX_FILE_BYTES)
        return bad(`"${fileName}" is too large (max ${MAX_FILE_LABEL}).`);
      sources.push({ file, fileName, storedMime, size: head.size });
    }

    // Fan out: one note (+ its files) per target subject. The origin target uses the
    // uploaded objects as-is; each extra target gets a server-side COPY (R2→R2, D33).
    const ids: string[] = [];
    for (const target of targets) {
      const isOrigin = target.subjectId === subjectId;

      // --- Insert the parent note row first (files hang off it) ---
      const { data: row, error: insErr } = await supabase
        .from("study_materials")
        .insert({
          subject_id: target.subjectId,
          batch_id: target.batchId,
          teacher_id: user.id,
          kind: "notes",
          title,
          description: description || null,
        })
        .select("id")
        .single();
      if (insErr) throw insErr;

      // --- Attach each file (origin: the uploaded object; extra: a copy) and record a
      // child row. Any failure rolls back this target's COPIED objects AND its note.
      // (The origin objects are shared with the source and are only cleaned up if the
      // origin target itself fails, below.) ---
      const madeCopies: StoredFile[] = [];
      try {
        const childRows = [];
        for (let i = 0; i < sources.length; i++) {
          const s = sources[i];
          let stored = s.file;
          if (!isOrigin) {
            stored = await copyObject(s.file, {
              bucket: STUDY_BUCKET,
              keyPrefix: `${target.batchId}/${target.subjectId}`,
              ext: extForUpload(s.storedMime, s.fileName),
            });
            madeCopies.push(stored);
          }
          childRows.push({
            material_id: row.id as string,
            storage_provider: stored.provider,
            file_path: stored.path,
            file_name: s.fileName,
            file_size: s.size,
            mime_type: s.storedMime,
            order: i,
          });
        }

        const { error: filesErr } = await supabase
          .from("study_material_files")
          .insert(childRows);
        if (filesErr) throw filesErr;
      } catch (err) {
        // Remove this target's own objects: its copies, plus the origin uploads when it
        // is the origin target that failed.
        await removeObjects(STUDY_BUCKET, isOrigin ? sources.map((s) => s.file) : madeCopies);
        await supabase.from("study_materials").delete().eq("id", row.id);
        throw err;
      }

      ids.push(row.id as string);

      // Notify enrolled students of the new note (F15; best-effort). Deep-link to the
      // subject folder so the student lands where the note lives.
      await notifyBatchStudents(target.batchId, {
        type: "study_material",
        refId: row.id as string,
        title: "New study material",
        body: title,
        url: `/student/study-material/${target.subjectId}`,
      });
    }

    return NextResponse.json({
      id: ids[0],
      ids,
      count: ids.length,
      file_count: uploads.length,
    });
  } catch (error) {
    return handleError(error);
  }
}
