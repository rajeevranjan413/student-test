import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireTeacher } from "@/utils/auth";
import { createAdminClient } from "@/utils/supabase/admin";
import { HOMEWORK_BUCKET } from "@/utils/homework";
import { removeObjects, toStoredFile, type StoredFile } from "@/utils/storage";
import { filesForParent, storedFilesForParents } from "@/utils/files";

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

async function attemptCount(
  supabase: Awaited<ReturnType<typeof requireTeacher>>["supabase"],
  homeworkId: string
) {
  const { count, error } = await supabase
    .from("homework_attempts")
    .select("id", { count: "exact", head: true })
    .eq("homework_id", homeworkId);
  if (error) throw error;
  return count ?? 0;
}

// GET /api/homework/[id] — full homework for the admin detail view. For MCQ it
// includes the questions WITH answers (read via the service role, since those
// columns are SELECT-revoked). Teacher-only; a homework that isn't the caller's
// returns 404 (no leak).
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, user } = await requireTeacher();
    const { id } = await params;

    const { data: hw, error: hwErr } = await supabase
      .from("homework")
      .select(
        "id, batch_id, teacher_id, type, title, description, due_at, total_questions, marks_per_question, negative_marking, status, is_published, created_at, batches(name)"
      )
      .eq("id", id)
      .maybeSingle();
    if (hwErr) throw hwErr;
    if (!hw || hw.teacher_id !== user.id) return bad("Homework not found.", 404);

    const batches = hw.batches as { name?: string } | { name?: string }[] | null;
    const batchName = Array.isArray(batches) ? batches[0]?.name : batches?.name;

    let questions: unknown[] = [];
    if (hw.type === "mcq") {
      // Answer columns need the service role (column-revoked from authenticated).
      const admin = createAdminClient();
      const { data: qs, error: qErr } = await admin
        .from("homework_questions")
        .select("id, question_text, options, correct_answer, explanation, difficulty, order")
        .eq("homework_id", id)
        .order("order", { ascending: true });
      if (qErr) throw qErr;
      questions = (qs ?? []).map((q) => ({
        uid: q.id as string,
        text: q.question_text as string,
        options: (q.options as { key: string; text: string }[]) ?? [],
        correctOptionKey: q.correct_answer as string,
        explanation: (q.explanation as string | null) ?? "",
        difficulty: (q.difficulty as string | null) ?? undefined,
      }));
    }

    const files =
      hw.type === "file" ? await filesForParent(supabase, "homework_files", id) : [];

    return NextResponse.json({
      id: hw.id,
      batch_id: hw.batch_id,
      batch_name: batchName ?? null,
      type: hw.type,
      title: hw.title,
      description: hw.description ?? null,
      due_at: hw.due_at ?? null,
      total_questions: hw.total_questions ?? null,
      marks_per_question: hw.marks_per_question ?? 1,
      negative_marking: Number(hw.negative_marking ?? 0),
      files,
      status: hw.status,
      is_published: Boolean(hw.is_published),
      attempt_count: await attemptCount(supabase, id),
      questions,
    });
  } catch (error) {
    return handleError(error);
  }
}

// DELETE /api/homework/[id] — teacher-only. Hard-delete when it has no attempts
// (questions cascade + the file object is removed); soft-delete (archive) once it
// has attempts so student completion/score history survives.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, user } = await requireTeacher();
    const { id } = await params;

    const { data: hw, error: hwErr } = await supabase
      .from("homework")
      .select("id, teacher_id, type, file_path, storage_provider")
      .eq("id", id)
      .maybeSingle();
    if (hwErr) throw hwErr;
    if (!hw || hw.teacher_id !== user.id) return bad("Homework not found.", 404);

    const attempts = await attemptCount(supabase, id);

    if (attempts > 0) {
      const { error } = await supabase
        .from("homework")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      return NextResponse.json({ archived: true });
    }

    // No attempts — safe to hard-delete. Remove the file objects first (best-effort,
    // each from whichever provider holds it): all child files + any legacy inline file.
    if (hw.type === "file") {
      const objects: StoredFile[] = await storedFilesForParents(
        supabase,
        "homework_files",
        [id]
      );
      if (hw.file_path)
        objects.push(toStoredFile(hw.storage_provider, hw.file_path as string));
      if (objects.length > 0) await removeObjects(HOMEWORK_BUCKET, objects);
    }
    const { error } = await supabase.from("homework").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return handleError(error);
  }
}
