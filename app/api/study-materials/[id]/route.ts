import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireTeacher } from "@/utils/auth";
import { STUDY_BUCKET } from "@/utils/studyMaterial";
import { removeObjects, toStoredFile, type StoredFile } from "@/utils/storage";
import { storedFilesForParents } from "@/utils/files";

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
      .select("id, teacher_id, file_path, storage_provider")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!material || material.teacher_id !== user.id)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Remove the stored objects first (best-effort, each on its own provider), then
    // the row (child file rows cascade at the DB). Include any legacy file recorded
    // inline on the parent as well as all child files.
    const objects: StoredFile[] = await storedFilesForParents(
      supabase,
      "study_material_files",
      [id]
    );
    if (material.file_path) {
      objects.push(toStoredFile(material.storage_provider, material.file_path));
    }
    if (objects.length > 0) await removeObjects(STUDY_BUCKET, objects);

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
