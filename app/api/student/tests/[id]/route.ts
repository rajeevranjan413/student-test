import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireStudent } from "@/utils/auth";
import {
  buildReview,
  finalizeAttempt,
  loadAttempt,
  loadPublicQuestions,
  loadScorableQuestions,
  requireStudentTest,
} from "@/utils/studentTests";
import { createAdminClient } from "@/utils/supabase/admin";
import {
  computePhase,
  computeTiming,
  personalDeadline,
  type Answer,
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

// Public metadata block reused across responses (never includes answers).
function meta(test: Awaited<ReturnType<typeof requireStudentTest>>, questionCount: number) {
  return {
    id: test.id,
    title: test.title,
    exam_level: test.exam_level,
    batch_name: test.batch_name,
    scheduled_at: test.scheduled_at,
    duration_minutes: test.duration_minutes,
    marks_per_question: test.marks_per_question,
    negative_marking: test.negative_marking,
    passing_marks: test.passing_marks,
    total_questions: test.total_questions,
    question_count: questionCount,
  };
}

// GET /api/student/tests/[id] — bootstrap the take page. Returns test metadata,
// window phase and the student's own state. Question bodies are returned only
// for an in-progress attempt (resume); correct answers only after submission.
// Also lazily auto-submits an attempt whose personal deadline has elapsed (e.g.
// the student closed the tab) so scoring is never left dangling.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, user } = await requireStudent();
    const { id } = await params;
    const test = await requireStudentTest(supabase, user.id, id);

    if (!test.scheduled_at)
      return NextResponse.json({
        meta: meta(test, 0),
        phase: "upcoming",
        state: "not_started" as StudentTestState,
      });

    const timing = computeTiming(test.scheduled_at, test.duration_minutes);
    const now = Date.now();
    const phase = computePhase(timing, now);
    const attempt = await loadAttempt(supabase, id, user.id);

    // --- In-progress attempt ---
    if (attempt?.status === "in_progress" && attempt.started_at) {
      const deadline = personalDeadline(
        attempt.started_at,
        test.duration_minutes,
        timing
      );
      if (now >= deadline) {
        // Time is up but never submitted → auto-submit the saved answers.
        const result = await finalizeAttempt(
          test,
          attempt.id,
          attempt.answers as Answer[],
          deadline,
          timing
        );
        return NextResponse.json({
          meta: meta(test, result.review.length),
          phase,
          state: "submitted" as StudentTestState,
          result: {
            score: result.score,
            max_score: result.maxScore,
            correct_count: result.correctCount,
            is_late: result.isLate,
            submitted_at: result.submittedAt,
            auto_submitted: true,
            review: result.review,
          },
        });
      }

      const questions = await loadPublicQuestions(supabase, id);
      return NextResponse.json({
        meta: meta(test, questions.length),
        phase,
        state: "in_progress" as StudentTestState,
        attempt: {
          started_at: attempt.started_at,
          deadline: new Date(deadline).toISOString(),
          answers: attempt.answers,
        },
        questions,
      });
    }

    // --- Submitted attempt → return the graded review ---
    if (attempt?.status === "submitted") {
      const scorable = await loadScorableQuestions(id);
      return NextResponse.json({
        meta: meta(test, scorable.length),
        phase,
        state: "submitted" as StudentTestState,
        result: {
          score: Number(attempt.score),
          max_score: Number(attempt.max_score),
          correct_count: attempt.correct_count,
          is_late: attempt.is_late,
          submitted_at: attempt.submitted_at,
          auto_submitted: false,
          review: buildReview(scorable, attempt.answers as Answer[]),
        },
      });
    }

    // --- No attempt yet: pre-start screen. `missed` once the window has closed ---
    const { count } = await supabase
      .from("questions")
      .select("id", { count: "exact", head: true })
      .eq("quiz_id", id);

    return NextResponse.json({
      meta: meta(test, count ?? 0),
      phase,
      state: (phase === "closed" ? "missed" : "not_started") as StudentTestState,
    });
  } catch (error) {
    return handleError(error);
  }
}

// PATCH /api/student/tests/[id] — autosave in-progress answers. Keeps partial
// progress durable so timer auto-submit / tab-close still scores real choices.
// Only mutates the answer list of an in-progress attempt within the window.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, user } = await requireStudent();
    const { id } = await params;
    const test = await requireStudentTest(supabase, user.id, id);
    const body = (await request.json()) as { answers?: Answer[] };
    const answers = Array.isArray(body.answers) ? body.answers : [];

    const attempt = await loadAttempt(supabase, id, user.id);
    if (!attempt || attempt.status !== "in_progress" || !attempt.started_at)
      return NextResponse.json(
        { error: "No in-progress attempt to save." },
        { status: 409 }
      );

    if (!test.scheduled_at)
      return NextResponse.json({ error: "Test is not schedulable." }, { status: 409 });

    const timing = computeTiming(test.scheduled_at, test.duration_minutes);
    const deadline = personalDeadline(attempt.started_at, test.duration_minutes, timing);
    if (Date.now() >= deadline)
      return NextResponse.json({ error: "Time is up." }, { status: 409 });

    // Persist only known choices; ignore any keys we can't tie to a question.
    const clean = answers
      .filter((a) => a && typeof a.questionId === "string")
      .map((a) => ({
        questionId: a.questionId,
        optionKey: a.optionKey == null ? null : String(a.optionKey),
      }));

    // Attempt writes go through the service-role client (no browser write policy).
    const admin = createAdminClient();
    const { error } = await admin
      .from("quiz_attempts")
      .update({ answers: clean })
      .eq("id", attempt.id)
      .eq("status", "in_progress");
    if (error) throw error;

    return NextResponse.json({ saved: true });
  } catch (error) {
    return handleError(error);
  }
}
