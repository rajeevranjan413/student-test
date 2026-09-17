import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireUser } from "@/utils/auth";
import { createAdminClient } from "@/utils/supabase/admin";
import { STUDY_BUCKET } from "@/utils/studyMaterial";

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
    const mode =
      new URL(request.url).searchParams.get("mode") === "view"
        ? "view"
        : "download";

    // Read the row via the service role so the download decision doesn't depend on
    // RLS; authorization is enforced explicitly below for each role.
    const admin = createAdminClient();
    const { data: material, error } = await admin
      .from("study_materials")
      .select("id, batch_id, teacher_id, file_path, file_name, archived_at")
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

    // --- Mint a short-lived signed URL ---
    const { data: signed, error: signErr } = await admin.storage
      .from(STUDY_BUCKET)
      .createSignedUrl(
        material.file_path,
        60,
        mode === "download" ? { download: material.file_name } : undefined
      );
    if (signErr || !signed?.signedUrl) throw signErr ?? new Error("Sign failed");

    return NextResponse.json({ url: signed.signedUrl });
  } catch (error) {
    return handleError(error);
  }
}
