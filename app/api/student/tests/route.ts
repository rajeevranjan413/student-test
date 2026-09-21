import { NextResponse } from "next/server";
import { AuthError, requireStudent } from "@/utils/auth";
import { enrolledBatchIds } from "@/utils/studentTests";
import {
  computePhase,
  computeTiming,
  type StudentTestState,
} from "@/utils/test";

function handleError(error: unknown) {
  if (error instanceof AuthError)
    return NextResponse.json({ error: error.message }, { status: error.status });
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Unknown error" },
    { status: 500 }
  );
}

// GET /api/student/tests — every published test in the student's batches, each
// annotated with its window phase and the student's own attempt state. Powers
// the student dashboard; no correct answers or question bodies are returned.
export async function GET() {
  try {
    const { supabase, user } = await requireStudent();

    const batchIds = await enrolledBatchIds(supabase, user.id);
    if (batchIds.length === 0) return NextResponse.json([]);

    const { data: quizzes, error: qErr } = await supabase
      .from("quizzes")
      .select(
        "id, title, scheduled_at, duration_minutes, total_questions, marks_per_question, negative_marking, passing_marks, status, is_published, batch_id, created_at, updated_at, batches(name), questions(count)"
      )
      .in("batch_id", batchIds)
      .or("status.eq.published,status.eq.closed,is_published.eq.true")
      .order("scheduled_at", { ascending: false });
    if (qErr) throw qErr;

    // The student's attempts, keyed by quiz for a single lookup.
    const { data: attempts, error: aErr } = await supabase
      .from("quiz_attempts")
      .select("quiz_id, status, score, max_score, correct_count, is_late, submitted_at")
      .eq("student_id", user.id);
    if (aErr) throw aErr;
    const byQuiz = new Map(
      (attempts ?? []).map((a) => [a.quiz_id as string, a])
    );

    const now = Date.now();
    const rows = (quizzes ?? []).map((q) => {
      const batches = q.batches as { name?: string } | { name?: string }[] | null;
      const batchName = Array.isArray(batches) ? batches[0]?.name : batches?.name;
      const counts = q.questions as { count?: number }[] | null;

      const phase = q.scheduled_at
        ? computePhase(
            computeTiming(q.scheduled_at, q.duration_minutes ?? 30),
            now,
            q.status
          )
        : "upcoming";

      const attempt = byQuiz.get(q.id);
      let state: StudentTestState;
      if (attempt?.status === "submitted") state = "submitted";
      else if (attempt?.status === "in_progress") state = "in_progress";
      else if (phase === "closed") state = "missed";
      else state = "not_started";

      return {
        id: q.id,
        title: q.title,
        batch_id: q.batch_id ?? null,
        batch_name: batchName ?? null,
        scheduled_at: q.scheduled_at ?? null,
        duration_minutes: q.duration_minutes ?? 30,
        marks_per_question: q.marks_per_question ?? 1,
        negative_marking: Number(q.negative_marking ?? 0),
        passing_marks: q.passing_marks ?? null,
        question_count: counts?.[0]?.count ?? 0,
        created_at: q.created_at ?? null,
        updated_at: q.updated_at ?? null,
        phase,
        state,
        score: attempt?.status === "submitted" ? Number(attempt.score) : null,
        max_score:
          attempt?.status === "submitted" ? Number(attempt.max_score) : null,
        correct_count:
          attempt?.status === "submitted" ? attempt.correct_count : null,
        is_late: attempt?.is_late ?? false,
      };
    });

    return NextResponse.json(rows);
  } catch (error) {
    return handleError(error);
  }
}
