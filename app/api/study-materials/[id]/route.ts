import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireTeacher } from "@/utils/auth";
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

// DELETE /api/study-materials/[id] — remove a material (storage object + row).
// A material carries no results/history, so it is hard-deleted (unlike tests).
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, user } = await requireTeacher();
    const { id } = await params;

    // Load + ownership check (404 on mismatch, so existence isn't leaked).
    const { data: material, error } = await supabase
      .from("study_materials")
      .select("id, teacher_id, file_path")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!material || material.teacher_id !== user.id)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Remove the stored object first (best-effort), then the row.
    const admin = createAdminClient();
    if (material.file_path) {
      await admin.storage.from(STUDY_BUCKET).remove([material.file_path]);
    }

    const { error: delErr } = await supabase
      .from("study_materials")
      .delete()
      .eq("id", id);
    if (delErr) throw delErr;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}
