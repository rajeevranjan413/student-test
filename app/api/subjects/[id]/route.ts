import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireTeacher } from "@/utils/auth";
import { STUDY_BUCKET } from "@/utils/studyMaterial";
import { removeObjects, toStoredFile } from "@/utils/storage";

function handleError(error: unknown) {
  if (error instanceof AuthError)
    return NextResponse.json({ error: error.message }, { status: error.status });
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Unknown error" },
    { status: 500 }
  );
}

// DELETE /api/subjects/[id] — remove a subject (folder) and everything in it.
// A subject carries no results/history, so it is hard-deleted. Its study_materials
// rows cascade at the DB (FK ON DELETE CASCADE), but their storage objects do not —
// so we remove those bytes first (best-effort) to avoid orphaned files.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, user } = await requireTeacher();
    const { id } = await params;

    // Load + ownership check (404 on mismatch, so existence isn't leaked).
    const { data: subject, error } = await supabase
      .from("subjects")
      .select("id, teacher_id")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!subject || subject.teacher_id !== user.id)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Remove the stored objects of this subject's notes before the cascade delete
    // (each note may live on a different provider — Supabase or Cloudinary).
    const { data: notes, error: notesErr } = await supabase
      .from("study_materials")
      .select("file_path, storage_provider")
      .eq("subject_id", id);
    if (notesErr) throw notesErr;

    const files = (notes ?? [])
      .filter((n) => !!n.file_path)
      .map((n) => toStoredFile(n.storage_provider, n.file_path as string));
    if (files.length > 0) {
      await removeObjects(STUDY_BUCKET, files);
    }

    const { error: delErr } = await supabase
      .from("subjects")
      .delete()
      .eq("id", id);
    if (delErr) throw delErr;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}
