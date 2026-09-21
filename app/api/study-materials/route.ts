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
export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireTeacher();

    const form = await request.formData();
    const title = String(form.get("title") ?? "").trim();
    const description = String(form.get("description") ?? "").trim();
    const subjectId = String(form.get("subjectId") ?? "").trim();
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

    // Resolve the subject → its batch, and verify ownership (no cross-teacher writes).
    const { data: subject, error: subjErr } = await supabase
      .from("subjects")
      .select("id, batch_id, teacher_id")
      .eq("id", subjectId)
      .maybeSingle();
    if (subjErr) throw subjErr;
    if (!subject) return bad("Selected subject was not found.", 404);
    if (subject.teacher_id !== user.id)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const batchId = subject.batch_id as string;

    // --- Insert the parent note row first (files hang off it) ---
    const { data: row, error: insErr } = await supabase
      .from("study_materials")
      .insert({
        subject_id: subjectId,
        batch_id: batchId,
        teacher_id: user.id,
        kind: "notes",
        title,
        description: description || null,
      })
      .select("id")
      .single();
    if (insErr) throw insErr;

    // --- Upload each file to the active provider's private store (D27) and record a
    // child row. Any failure rolls back the objects AND the parent note. ---
    const uploaded: StoredFile[] = [];
    try {
      const childRows = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileName = file.name || "notes";
        const mime = file.type || "";
        const storedMime = (ACCEPTED_MIMES as readonly string[]).includes(mime)
          ? mime
          : "application/pdf";
        const stored = await uploadObject({
          bucket: STUDY_BUCKET,
          keyPrefix: `${batchId}/${subjectId}`,
          ext: extForUpload(mime, fileName),
          contentType: storedMime,
          bytes: Buffer.from(await file.arrayBuffer()),
        });
        uploaded.push(stored);
        childRows.push({
          material_id: row.id as string,
          storage_provider: stored.provider,
          file_path: stored.path,
          file_name: fileName,
          file_size: file.size,
          mime_type: storedMime,
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

    // Notify enrolled students of the new note (F15; best-effort). Deep-link to the
    // subject folder so the student lands where the note lives.
    await notifyBatchStudents(batchId, {
      type: "study_material",
      refId: row.id as string,
      title: "New study material",
      body: title,
      url: `/student/study-material/${subjectId}`,
    });

    return NextResponse.json({ id: row.id, file_count: files.length });
  } catch (error) {
    return handleError(error);
  }
}
