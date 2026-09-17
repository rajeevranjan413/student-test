import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { AuthError, requireTeacher } from "@/utils/auth";
import { createAdminClient } from "@/utils/supabase/admin";
import {
  ACCEPTED_MIME,
  MAX_FILE_BYTES,
  STUDY_BUCKET,
} from "@/utils/studyMaterial";

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

// GET /api/study-materials — the teacher's uploaded materials (optional ?batch=).
export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireTeacher();
    const batchId = new URL(request.url).searchParams.get("batch");

    let query = supabase
      .from("study_materials")
      .select(
        "id, batch_id, kind, title, description, file_name, file_size, mime_type, created_at, batches(name)"
      )
      .eq("teacher_id", user.id)
      .is("archived_at", null)
      .order("created_at", { ascending: false });

    if (batchId) query = query.eq("batch_id", batchId);

    const { data, error } = await query;
    if (error) throw error;

    const rows = (data ?? []).map((m) => {
      const batches = m.batches as { name?: string } | { name?: string }[] | null;
      const batchName = Array.isArray(batches) ? batches[0]?.name : batches?.name;
      return {
        id: m.id,
        batch_id: m.batch_id,
        batch_name: batchName ?? null,
        kind: m.kind,
        title: m.title,
        description: m.description ?? null,
        file_name: m.file_name,
        file_size: m.file_size ?? null,
        mime_type: m.mime_type ?? null,
        created_at: m.created_at,
      };
    });

    return NextResponse.json(rows);
  } catch (error) {
    return handleError(error);
  }
}

// POST /api/study-materials — upload a PDF (multipart) + insert its metadata row.
export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireTeacher();

    const form = await request.formData();
    const title = String(form.get("title") ?? "").trim();
    const description = String(form.get("description") ?? "").trim();
    const batchId = String(form.get("batchId") ?? "").trim();
    const file = form.get("file");

    // --- Validation ---
    if (!title) return bad("A title is required.");
    if (!batchId) return bad("A batch must be selected.");
    if (!(file instanceof Blob) || file.size === 0)
      return bad("A PDF file is required.");
    const fileName =
      file instanceof File && file.name ? file.name : "notes.pdf";
    const mime = file.type || ACCEPTED_MIME;
    if (mime !== ACCEPTED_MIME && !fileName.toLowerCase().endsWith(".pdf"))
      return bad("Only PDF files are allowed.");
    if (file.size > MAX_FILE_BYTES)
      return bad("File is too large (max 25 MB).");

    // Verify the batch belongs to this teacher (no cross-teacher uploads).
    const { data: batch, error: batchErr } = await supabase
      .from("batches")
      .select("id, teacher_id")
      .eq("id", batchId)
      .maybeSingle();
    if (batchErr) throw batchErr;
    if (!batch) return bad("Selected batch was not found.", 404);
    if (batch.teacher_id !== user.id)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // --- Upload the bytes to the private bucket via the service role ---
    const admin = createAdminClient();
    const objectPath = `${batchId}/${randomUUID()}.pdf`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: upErr } = await admin.storage
      .from(STUDY_BUCKET)
      .upload(objectPath, buffer, {
        contentType: ACCEPTED_MIME,
        upsert: false,
      });
    if (upErr) throw upErr;

    // --- Insert the metadata row (teacher insert policy covers this) ---
    const { data: row, error: insErr } = await supabase
      .from("study_materials")
      .insert({
        batch_id: batchId,
        teacher_id: user.id,
        kind: "notes",
        title,
        description: description || null,
        file_path: objectPath,
        file_name: fileName,
        file_size: file.size,
        mime_type: ACCEPTED_MIME,
      })
      .select("id")
      .single();

    if (insErr) {
      // Roll back the uploaded object so we never leave an orphaned file.
      await admin.storage.from(STUDY_BUCKET).remove([objectPath]);
      throw insErr;
    }

    return NextResponse.json({ id: row.id });
  } catch (error) {
    return handleError(error);
  }
}
