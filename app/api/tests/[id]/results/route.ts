import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireTeacher } from "@/utils/auth";
import {
  computePhase,
  computeTiming,
  deriveOutcome,
  type TestPhase,
} from "@/utils/test";

function handleError(error: unknown) {
  if (error instanceof AuthError)
    return NextResponse.json({ error: error.message }, { status: error.status });
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Unknown error" },
    { status: 500 }
  );
}

type AttemptRecord = {
  student_id: string;
  status: "in_progress" | "submitted" | "missed";
  started_at: string | null;
  submitted_at: string | null;
  is_late: boolean | null;
  score: number | null;
  max_score: number | null;
  correct_count: number | null;
};

// GET /api/tests/[id]/results — teacher-only late/missed reporting for one test.
// Returns the test window, a per-enrolled-student row (on-time / late / missed /
// in-progress with score), and roll-up counts. Read-only; no answers exposed.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, user } = await requireTeacher();
    const { id } = await params;

    // Load the test and confirm it belongs to this teacher (404, don't leak).
    const { data: quiz, error: quizErr } = await supabase
      .from("quizzes")
      .select(
        "id, title, exam_level, scheduled_at, duration_minutes, total_questions, marks_per_question, negative_marking, passing_marks, status, teacher_id, batch_id, batches(name), questions(count)"
      )
      .eq("id", id)
      .maybeSingle();
    if (quizErr) throw quizErr;
    if (!quiz || quiz.teacher_id !== user.id)
      return NextResponse.json({ error: "Test not found." }, { status: 404 });

    const batches = quiz.batches as { name?: string } | { name?: string }[] | null;
    const batchName = Array.isArray(batches) ? batches[0]?.name : batches?.name;
    const qCounts = quiz.questions as { count?: number }[] | null;
    const questionCount = qCounts?.[0]?.count ?? 0;

    const timing = quiz.scheduled_at
      ? computeTiming(quiz.scheduled_at, quiz.duration_minutes ?? 30)
      : null;
    const phase: TestPhase = timing ? computePhase(timing) : "upcoming";

    // Enrolled students in this test's batch (so non-attempters show as missed).
    const { data: enrolled, error: enrErr } = await supabase
      .from("student_batches")
      .select("student_id, profiles(full_name)")
      .eq("batch_id", quiz.batch_id);
    if (enrErr) throw enrErr;

    // Every attempt at this test, keyed by student for a single lookup.
    const { data: attempts, error: aErr } = await supabase
      .from("quiz_attempts")
      .select(
        "student_id, status, started_at, submitted_at, is_late, score, max_score, correct_count"
      )
      .eq("quiz_id", id);
    if (aErr) throw aErr;
    const byStudent = new Map<string, AttemptRecord>(
      (attempts ?? []).map((a) => [
        a.student_id as string,
        {
          student_id: a.student_id as string,
          status: a.status,
          started_at: a.started_at ?? null,
          submitted_at: a.submitted_at ?? null,
          is_late: a.is_late ?? null,
          score: a.score == null ? null : Number(a.score),
          max_score: a.max_score == null ? null : Number(a.max_score),
          correct_count: a.correct_count ?? null,
        },
      ])
    );

    const passing = quiz.passing_marks ?? null;

    const rows = (enrolled ?? []).map((e) => {
      const studentId = e.student_id as string;
      const profile = e.profiles as { full_name?: string } | { full_name?: string }[] | null;
      const name = Array.isArray(profile) ? profile[0]?.full_name : profile?.full_name;
      const attempt = byStudent.get(studentId);
      const outcome = deriveOutcome(attempt, phase);
      const submitted = attempt?.status === "submitted";
      const score = submitted ? attempt!.score : null;
      const maxScore = submitted ? attempt!.max_score : null;
      const percent =
        submitted && maxScore && maxScore > 0
          ? Math.round(((score ?? 0) / maxScore) * 1000) / 10
          : null;
      return {
        student_id: studentId,
        name: name ?? "Student",
        outcome,
        started_at: attempt?.started_at ?? null,
        submitted_at: attempt?.submitted_at ?? null,
        is_late: attempt?.is_late ?? false,
        score,
        max_score: maxScore,
        correct_count: submitted ? attempt!.correct_count : null,
        percent,
        passed: submitted && passing != null ? (score ?? 0) >= passing : null,
      };
    });

    // Roll-up counts across the enrolled cohort.
    const summary = {
      enrolled: rows.length,
      on_time: rows.filter((r) => r.outcome === "on_time").length,
      late: rows.filter((r) => r.outcome === "late").length,
      in_progress: rows.filter((r) => r.outcome === "in_progress").length,
      expired: rows.filter((r) => r.outcome === "expired").length,
      missed: rows.filter((r) => r.outcome === "missed").length,
      pending: rows.filter((r) => r.outcome === "pending").length,
      submitted: rows.filter(
        (r) => r.outcome === "on_time" || r.outcome === "late"
      ).length,
    };
    const scored = rows.filter((r) => r.score != null && r.max_score != null);
    const averageScore =
      scored.length > 0
        ? Math.round(
            (scored.reduce((s, r) => s + (r.score ?? 0), 0) / scored.length) * 100
          ) / 100
        : null;
    const averagePercent =
      scored.length > 0
        ? Math.round(
            (scored.reduce((s, r) => s + (r.percent ?? 0), 0) / scored.length) * 10
          ) / 10
        : null;

    return NextResponse.json({
      test: {
        id: quiz.id,
        title: quiz.title,
        exam_level: quiz.exam_level ?? null,
        batch_name: batchName ?? null,
        scheduled_at: quiz.scheduled_at ?? null,
        duration_minutes: quiz.duration_minutes ?? 30,
        total_questions: quiz.total_questions ?? null,
        marks_per_question: quiz.marks_per_question ?? 1,
        negative_marking: Number(quiz.negative_marking ?? 0),
        passing_marks: passing,
        status: quiz.status,
        question_count: questionCount,
        phase,
        opens_at: timing ? new Date(timing.opensAt).toISOString() : null,
        due_at: timing ? new Date(timing.dueAt).toISOString() : null,
        closes_at: timing ? new Date(timing.closesAt).toISOString() : null,
      },
      summary: { ...summary, average_score: averageScore, average_percent: averagePercent },
      rows,
    });
  } catch (error) {
    return handleError(error);
  }
}
