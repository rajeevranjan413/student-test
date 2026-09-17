import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireTeacher } from "@/utils/auth";
import { createAdminClient } from "@/utils/supabase/admin";

type IncomingOption = { key: string; text: string };
type IncomingQuestion = {
  text: string;
  options: IncomingOption[];
  correctOptionKey: string;
  explanation?: string;
  difficulty?: string;
};

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

// How many students have started/finished this test. Used to decide hard-delete vs
// archive, and to lock question edits once attempts exist.
async function attemptCount(
  supabase: Awaited<ReturnType<typeof requireTeacher>>["supabase"],
  quizId: string
) {
  const { count, error } = await supabase
    .from("quiz_attempts")
    .select("id", { count: "exact", head: true })
    .eq("quiz_id", quizId);
  if (error) throw error;
  return count ?? 0;
}

// GET /api/tests/[id] — full test + its questions (incl. answer columns) for the
// edit form. Teacher-only; a test that isn't the caller's returns 404 (no leak).
// Answer columns are SELECT-revoked from the browser JWT (F10), so questions are
// read through the service-role client.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, user } = await requireTeacher();
    const { id } = await params;

    const { data: quiz, error: quizErr } = await supabase
      .from("quizzes")
      .select(
        "id, title, scheduled_at, duration_minutes, total_questions, marks_per_question, negative_marking, passing_marks, status, is_published, teacher_id, batch_id, batches(name)"
      )
      .eq("id", id)
      .maybeSingle();
    if (quizErr) throw quizErr;
    if (!quiz || quiz.teacher_id !== user.id)
      return bad("Test not found.", 404);

    const batches = quiz.batches as { name?: string } | { name?: string }[] | null;
    const batchName = Array.isArray(batches) ? batches[0]?.name : batches?.name;

    // Answer columns need the service role (column-revoked from authenticated).
    const admin = createAdminClient();
    const { data: questions, error: qErr } = await admin
      .from("questions")
      .select("id, question_text, options, correct_answer, explanation, difficulty, order")
      .eq("quiz_id", id)
      .order("order", { ascending: true });
    if (qErr) throw qErr;

    const attempts = await attemptCount(supabase, id);

    return NextResponse.json({
      id: quiz.id,
      title: quiz.title,
      batch_id: quiz.batch_id,
      batch_name: batchName ?? null,
      scheduled_at: quiz.scheduled_at ?? null,
      duration_minutes: quiz.duration_minutes ?? 30,
      total_questions: quiz.total_questions ?? null,
      marks_per_question: quiz.marks_per_question ?? 1,
      negative_marking: Number(quiz.negative_marking ?? 0),
      passing_marks: quiz.passing_marks ?? null,
      status: quiz.status,
      attempt_count: attempts,
      // Questions can only be replaced while nobody has attempted the test.
      questions_editable: attempts === 0,
      questions: (questions ?? []).map((q) => ({
        uid: q.id as string,
        text: q.question_text as string,
        options: (q.options as IncomingOption[]) ?? [],
        correctOptionKey: q.correct_answer as string,
        explanation: (q.explanation as string | null) ?? "",
        difficulty: (q.difficulty as string | null) ?? undefined,
      })),
    });
  } catch (error) {
    return handleError(error);
  }
}

// PUT /api/tests/[id] — update a test's settings (always) and, only while it has no
// attempts, replace its question set. Teacher-only; ownership re-checked.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, user } = await requireTeacher();
    const { id } = await params;
    const body = await request.json();
    const {
      title,
      batchId,
      scheduledAt,
      durationMinutes,
      totalQuestions,
      marksPerQuestion,
      negativeMarking,
      passingMarks,
      status,
      questions,
    } = body as {
      title?: string;
      batchId?: string;
      scheduledAt?: string;
      durationMinutes?: number;
      totalQuestions?: number;
      marksPerQuestion?: number;
      negativeMarking?: number;
      passingMarks?: number | null;
      status?: "draft" | "published" | "closed";
      questions?: IncomingQuestion[];
    };

    // --- Validation ---
    if (!title?.trim()) return bad("A test title is required.");
    if (!batchId) return bad("A batch must be selected.");
    if (!scheduledAt) return bad("A scheduled date & time is required.");
    if (status && !["draft", "published", "closed"].includes(status))
      return bad("Invalid status.");

    // Confirm the test exists and belongs to this teacher (404, don't leak).
    const { data: quiz, error: quizErr } = await supabase
      .from("quizzes")
      .select("id, teacher_id")
      .eq("id", id)
      .maybeSingle();
    if (quizErr) throw quizErr;
    if (!quiz || quiz.teacher_id !== user.id) return bad("Test not found.", 404);

    // A changed batch must also belong to this teacher (no cross-teacher writes).
    const { data: batch, error: batchErr } = await supabase
      .from("batches")
      .select("id, teacher_id")
      .eq("id", batchId)
      .single();
    if (batchErr || !batch) return bad("Selected batch was not found.", 404);
    if (batch.teacher_id !== user.id)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const nextStatus = status ?? "draft";
    const publish = nextStatus !== "draft";

    // --- Update the test settings ---
    const { data: updated, error: updErr } = await supabase
      .from("quizzes")
      .update({
        title: title.trim(),
        batch_id: batchId,
        scheduled_at: scheduledAt,
        duration_minutes: durationMinutes ?? 30,
        total_questions: totalQuestions ?? null,
        marks_per_question: marksPerQuestion ?? 1,
        negative_marking: negativeMarking ?? 0,
        passing_marks: passingMarks ?? null,
        status: nextStatus,
        is_published: publish,
      })
      .eq("id", id)
      .select("id, status")
      .single();
    if (updErr) throw updErr;

    // --- Optionally replace the question set ---
    if (Array.isArray(questions)) {
      if (questions.length === 0)
        return bad("A test must keep at least one question.");

      // Guard: editing questions after students have attempted would corrupt scores.
      const attempts = await attemptCount(supabase, id);
      if (attempts > 0)
        return bad(
          "This test already has attempts — its questions can no longer be edited.",
          409
        );

      // Validate each question before touching the DB.
      for (const q of questions) {
        if (!q.text?.trim()) return bad("Every question needs text.");
        if (!Array.isArray(q.options) || q.options.length !== 4)
          return bad("Every question needs exactly four options.");
        if (q.options.some((o) => !o.text?.trim()))
          return bad("Every option needs text.");
        if (!q.options.some((o) => o.key === q.correctOptionKey))
          return bad("Each question needs a valid correct option.");
      }

      // Replace: delete-all-then-insert (mirrors the POST insert shape).
      const { error: delErr } = await supabase
        .from("questions")
        .delete()
        .eq("quiz_id", id);
      if (delErr) throw delErr;

      const rows = questions.map((q, i) => ({
        quiz_id: id,
        question_text: q.text.trim(),
        options: q.options,
        correct_answer: q.correctOptionKey,
        explanation: q.explanation ?? null,
        difficulty: q.difficulty ?? null,
        order: i,
      }));
      const { error: insErr } = await supabase.from("questions").insert(rows);
      if (insErr) throw insErr;
    }

    return NextResponse.json({ id: updated.id, status: updated.status });
  } catch (error) {
    return handleError(error);
  }
}

// DELETE /api/tests/[id] — teacher-only. Hard-delete a test with no attempts (its
// questions cascade); soft-delete (archive) one that has attempts so results and
// leaderboard history survive (D22).
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, user } = await requireTeacher();
    const { id } = await params;

    const { data: quiz, error: quizErr } = await supabase
      .from("quizzes")
      .select("id, teacher_id")
      .eq("id", id)
      .maybeSingle();
    if (quizErr) throw quizErr;
    if (!quiz || quiz.teacher_id !== user.id) return bad("Test not found.", 404);

    const attempts = await attemptCount(supabase, id);

    if (attempts > 0) {
      // Preserve history — archive instead of destroying.
      const { error } = await supabase
        .from("quizzes")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      return NextResponse.json({ archived: true });
    }

    // No attempts — safe to hard-delete (questions cascade on delete).
    const { error } = await supabase.from("quizzes").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return handleError(error);
  }
}
