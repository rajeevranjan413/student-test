import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireUser } from "@/utils/auth";
import { createAdminClient } from "@/utils/supabase/admin";
import { STUDY_BUCKET } from "@/utils/studyMaterial";
import { signedUrl, toStoredFile } from "@/utils/storage";
import { resolveDownloadFile } from "@/utils/files";

function handleError(error: unknown) {
  if (error instanceof AuthError)
    return NextResponse.json({ error: error.message }, { status: error.status });
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Unknown error" },
    { status: 500 }
  );
}

// GET /api/study-materials/[id]/download?mode=view|download
// Shared by teacher + student: authorizes the caller, then mints a short-lived
// signed URL to the private object. `download` (default) forces a download with the
// original filename; `view` opens the PDF inline. Enrollment is re-checked here on
// every request, so access follows enrollment live.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, user } = await requireUser();
    const { id } = await params;
    const url = new URL(request.url);
    const mode = url.searchParams.get("mode") === "view" ? "view" : "download";
    const fileId = url.searchParams.get("file");

    // Read the row via the service role so the download decision doesn't depend on
    // RLS; authorization is enforced explicitly below for each role.
    const admin = createAdminClient();
    const { data: material, error } = await admin
      .from("study_materials")
      .select("id, batch_id, teacher_id, file_path, file_name, archived_at, storage_provider")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!material)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    // --- Authorize ---
    if (user.role === "teacher") {
      if (material.teacher_id !== user.id)
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    } else {
      // Student: must be enrolled in the material's batch and the material live.
      if (material.archived_at)
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      const { data: enrolled, error: enrErr } = await supabase
        .from("student_batches")
        .select("batch_id")
        .eq("student_id", user.id)
        .eq("batch_id", material.batch_id)
        .maybeSingle();
      if (enrErr) throw enrErr;
      if (!enrolled)
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // --- Resolve which file to serve: the requested `?file=` (verified to belong to
    // this note) or the note's first file; fall back to a legacy inline file. ---
    const target = await resolveDownloadFile(admin, "study_material_files", id, fileId);
    const stored = target
      ? { file: target.file, fileName: target.fileName }
      : material.file_path
      ? {
          file: toStoredFile(material.storage_provider, material.file_path),
          fileName: material.file_name ?? "file",
        }
      : null;
    if (!stored) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // --- Mint a short-lived, authorized URL (Supabase or Cloudinary per row) ---
    const signed = await signedUrl(stored.file, {
      bucket: STUDY_BUCKET,
      mode,
      fileName: stored.fileName,
    });

    return NextResponse.json({ url: signed });
  } catch (error) {
    return handleError(error);
  }
}
