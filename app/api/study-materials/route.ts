import { NextResponse } from "next/server";
import { AuthError, requireTeacher } from "@/utils/auth";
import {
  ACCEPTED_MIMES,
  MAX_FILE_BYTES,
  STUDY_BUCKET,
  extForUpload,
  isAcceptedFile,
} from "@/utils/studyMaterial";
import { removeObjects, uploadObject } from "@/utils/storage";

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

function mapRow(m: Record<string, unknown>) {
  const batches = m.batches as { name?: string } | { name?: string }[] | null;
  const batchName = Array.isArray(batches) ? batches[0]?.name : batches?.name;
  return {
    id: m.id as string,
    subject_id: (m.subject_id as string | null) ?? null,
    batch_id: m.batch_id as string,
    batch_name: batchName ?? null,
    kind: m.kind as string,
    title: m.title as string,
    description: (m.description as string | null) ?? null,
    file_name: m.file_name as string,
    file_size: (m.file_size as number | null) ?? null,
    mime_type: (m.mime_type as string | null) ?? null,
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

    return NextResponse.json((data ?? []).map(mapRow));
  } catch (error) {
    return handleError(error);
  }
}

// POST /api/study-materials — file a PDF/image note (multipart) under a subject.
export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireTeacher();

    const form = await request.formData();
    const title = String(form.get("title") ?? "").trim();
    const description = String(form.get("description") ?? "").trim();
    const subjectId = String(form.get("subjectId") ?? "").trim();
    const file = form.get("file");

    // --- Validation ---
    if (!title) return bad("A title is required.");
    if (!subjectId) return bad("A subject must be selected.");
    if (!(file instanceof Blob) || file.size === 0)
      return bad("A PDF or image file is required.");
    const fileName =
      file instanceof File && file.name ? file.name : "notes";
    const mime = file.type || "";
    if (!isAcceptedFile(mime, fileName))
      return bad("Only PDF or image files are allowed.");
    if (file.size > MAX_FILE_BYTES)
      return bad("File is too large (max 25 MB).");

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
    // Normalize the stored mime to an accepted value (fall back to PDF).
    const storedMime = (ACCEPTED_MIMES as readonly string[]).includes(mime)
      ? mime
      : "application/pdf";

    // --- Upload the bytes to the active provider's private store ---
    // Supabase by default; Cloudinary once STORAGE_PROVIDER=cloudinary (D27). The
    // returned `provider`/`path` are persisted so download/delete route per-file.
    const buffer = Buffer.from(await file.arrayBuffer());
    const stored = await uploadObject({
      bucket: STUDY_BUCKET,
      keyPrefix: `${batchId}/${subjectId}`,
      ext: extForUpload(mime, fileName),
      contentType: storedMime,
      bytes: buffer,
    });

    // --- Insert the metadata row (teacher insert policy covers this) ---
    const { data: row, error: insErr } = await supabase
      .from("study_materials")
      .insert({
        subject_id: subjectId,
        batch_id: batchId,
        teacher_id: user.id,
        kind: "notes",
        title,
        description: description || null,
        storage_provider: stored.provider,
        file_path: stored.path,
        file_name: fileName,
        file_size: file.size,
        mime_type: storedMime,
      })
      .select("id")
      .single();

    if (insErr) {
      // Roll back the uploaded object so we never leave an orphaned file.
      await removeObjects(STUDY_BUCKET, [stored]);
      throw insErr;
    }

    return NextResponse.json({ id: row.id });
  } catch (error) {
    return handleError(error);
  }
}
