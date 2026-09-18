import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireUser } from "@/utils/auth";
import { createAdminClient } from "@/utils/supabase/admin";
import { HOMEWORK_BUCKET } from "@/utils/homework";
import { signedUrl, toStoredFile } from "@/utils/storage";

function handleError(error: unknown) {
  if (error instanceof AuthError)
    return NextResponse.json({ error: error.message }, { status: error.status });
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Unknown error" },
    { status: 500 }
  );
}

// GET /api/homework/[id]/download?mode=view|download
// Shared by teacher + student: authorizes the caller, then mints a short-lived
// signed URL to the private `file` homework object. Enrollment is re-checked here
// on every request, so access follows enrollment live. Only `file` homework has a
// downloadable object.
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

    // Read the row via the service role so the decision doesn't depend on RLS;
    // authorization is enforced explicitly below for each role.
    const admin = createAdminClient();
    const { data: hw, error } = await admin
      .from("homework")
      .select(
        "id, batch_id, teacher_id, type, file_path, file_name, archived_at, status, is_published, storage_provider"
      )
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!hw || hw.type !== "file" || !hw.file_path)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    // --- Authorize ---
    if (user.role === "teacher") {
      if (hw.teacher_id !== user.id)
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    } else {
      // Student: homework must be live + published, and they must be enrolled.
      const visible =
        !hw.archived_at && (hw.is_published || hw.status !== "draft");
      if (!visible)
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      const { data: enrolled, error: enrErr } = await supabase
        .from("student_batches")
        .select("batch_id")
        .eq("student_id", user.id)
        .eq("batch_id", hw.batch_id)
        .maybeSingle();
      if (enrErr) throw enrErr;
      if (!enrolled)
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // --- Mint a short-lived, authorized URL (Supabase or Cloudinary per row) ---
    const url = await signedUrl(
      toStoredFile(hw.storage_provider, hw.file_path as string),
      {
        bucket: HOMEWORK_BUCKET,
        mode,
        fileName: (hw.file_name as string) || "homework",
      }
    );

    return NextResponse.json({ url });
  } catch (error) {
    return handleError(error);
  }
}
