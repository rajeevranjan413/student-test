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
import { removeObjects, uploadObject, type StoredFile } from "@/utils/storage";
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

// POST /api/study-materials — file one or MORE PDF/image notes (multipart) under a
// subject. Several files (`file` repeated) become a single note owning many files
// (D28). The parent row holds the title/description; each file is a child row.
//
// Multi-batch (D33): an optional `batchIds` list also files the note into a
// **same-named subject in each selected batch** (created when missing). The origin
// subject is always included; the bytes are buffered once and re-uploaded per target.
export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireTeacher();

    const form = await request.formData();
    const title = String(form.get("title") ?? "").trim();
    const description = String(form.get("description") ?? "").trim();
    const subjectId = String(form.get("subjectId") ?? "").trim();
    const extraBatchIds = form
      .getAll("batchIds")
      .map((b) => String(b).trim())
      .filter(Boolean);
    const files = form
      .getAll("file")
      .filter((f): f is File => f instanceof File && f.size > 0);

    // --- Validation ---
    if (!title) return bad("A title is required.");
    if (!subjectId) return bad("A subject must be selected.");
    if (files.length === 0) return bad("At least one PDF or image file is required.");
    if (files.length > MAX_FILES_PER_ITEM)
      return bad(`You can attach up to ${MAX_FILES_PER_ITEM} files at once.`);
    for (const file of files) {
      const fileName = file.name || "notes";
      if (!isAcceptedFile(file.type || "", fileName))
        return bad(`"${fileName}": only PDF or image files are allowed.`);
      if (file.size > MAX_FILE_BYTES)
        return bad(`"${fileName}" is too large (max ${MAX_FILE_LABEL}).`);
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

    // Read each file's bytes ONCE, then re-upload them for every target (D33).
    const buffered = await Promise.all(
      files.map(async (file) => {
        const fileName = file.name || "notes";
        const mime = file.type || "";
        const storedMime = (ACCEPTED_MIMES as readonly string[]).includes(mime)
          ? mime
          : "application/pdf";
        return {
          fileName,
          mime,
          storedMime,
          size: file.size,
          bytes: Buffer.from(await file.arrayBuffer()),
        };
      })
    );

    // Fan out: one note (+ its files) per target subject.
    const ids: string[] = [];
    for (const target of targets) {
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

      // --- Upload each buffered file to the active provider's private store (D27) and
      // record a child row. Any failure rolls back this target's objects AND note. ---
      const uploaded: StoredFile[] = [];
      try {
        const childRows = [];
        for (let i = 0; i < buffered.length; i++) {
          const f = buffered[i];
          const stored = await uploadObject({
            bucket: STUDY_BUCKET,
            keyPrefix: `${target.batchId}/${target.subjectId}`,
            ext: extForUpload(f.mime, f.fileName),
            contentType: f.storedMime,
            bytes: f.bytes,
          });
          uploaded.push(stored);
          childRows.push({
            material_id: row.id as string,
            storage_provider: stored.provider,
            file_path: stored.path,
            file_name: f.fileName,
            file_size: f.size,
            mime_type: f.storedMime,
            order: i,
          });
        }

        const { error: filesErr } = await supabase
          .from("study_material_files")
          .insert(childRows);
        if (filesErr) throw filesErr;
      } catch (err) {
        await removeObjects(STUDY_BUCKET, uploaded);
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
      file_count: files.length,
    });
  } catch (error) {
    return handleError(error);
  }
}
