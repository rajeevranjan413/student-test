import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireStudent } from "@/utils/auth";
import {
  finalizeAttempt,
  loadAttempt,
  requireStudentTest,
} from "@/utils/studentTests";
import {
  computeTiming,
  personalDeadline,
  type Answer,
} from "@/utils/test";

function handleError(error: unknown) {
  if (error instanceof AuthError)
    return NextResponse.json({ error: error.message }, { status: error.status });
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Unknown error" },
    { status: 500 }
  );
}

// POST /api/student/tests/[id]/submit — finalize the attempt. The client sends
// its answers; the server scores them (correct answers are read only here),
// stamps submitted_at, derives is_late from the schedule, and writes the graded
// row. Guarded so a submitted attempt can never be re-scored (single attempt).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, user } = await requireStudent();
    const { id } = await params;
    const test = await requireStudentTest(supabase, user.id, id);

    if (!test.scheduled_at)
      return NextResponse.json(
        { error: "This test has no schedule and cannot be submitted." },
        { status: 409 }
      );

    const attempt = await loadAttempt(supabase, id, user.id);
    if (!attempt || !attempt.started_at)
      return NextResponse.json(
        { error: "You have not started this test." },
        { status: 409 }
      );
    if (attempt.status === "submitted")
      return NextResponse.json(
        { error: "You have already submitted this test." },
        { status: 409 }
      );

    const body = (await request.json().catch(() => ({}))) as { answers?: Answer[] };
    const answers = (Array.isArray(body.answers) ? body.answers : [])
      .filter((a) => a && typeof a.questionId === "string")
      .map((a) => ({
        questionId: a.questionId,
        optionKey: a.optionKey == null ? null : String(a.optionKey),
      }));

    const timing = computeTiming(test.scheduled_at, test.duration_minutes);
    const deadline = personalDeadline(attempt.started_at, test.duration_minutes);
    // Cap the effective submit time at the personal deadline so a slow network
    // (or a late auto-submit) can't game the on-time / late classification.
    const submittedAtMs = Math.min(Date.now(), deadline);

    const result = await finalizeAttempt(
      test,
      attempt.id,
      answers,
      submittedAtMs,
      timing
    );

    return NextResponse.json({
      score: result.score,
      max_score: result.maxScore,
      correct_count: result.correctCount,
      is_late: result.isLate,
      submitted_at: result.submittedAt,
      passing_marks: test.passing_marks,
      review: result.review,
    });
  } catch (error) {
    return handleError(error);
  }
}
