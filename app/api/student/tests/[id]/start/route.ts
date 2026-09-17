import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireStudent } from "@/utils/auth";
import {
  finalizeAttempt,
  loadAttempt,
  loadPublicQuestions,
  requireStudentTest,
} from "@/utils/studentTests";
import { createAdminClient } from "@/utils/supabase/admin";
import {
  computePhase,
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

// POST /api/student/tests/[id]/start — begin (or resume) the attempt. This is
// where the window lock and single-attempt rule are enforced:
//   • upcoming (before scheduled_at) → 403 (not open yet)
//   • closed (teacher closed the test) → 403 (locked)
//   • already-submitted attempt  → 409 (one attempt only)
//   • existing in-progress       → resumed (idempotent), never a second row
// There is no time-based lock (D21): a test stays startable after scheduled_at
// until the teacher closes it. Starting records started_at, from which the
// personal countdown (full duration) is derived.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, user } = await requireStudent();
    const { id } = await params;
    const test = await requireStudentTest(supabase, user.id, id);

    if (!test.scheduled_at)
      return NextResponse.json(
        { error: "This test has no schedule and cannot be started." },
        { status: 409 }
      );

    const timing = computeTiming(test.scheduled_at, test.duration_minutes);
    const now = Date.now();
    const phase = computePhase(timing, now, test.status);

    if (phase === "upcoming")
      return NextResponse.json(
        { error: "This test has not opened yet." },
        { status: 403 }
      );
    if (phase === "closed")
      return NextResponse.json(
        { error: "This test is closed." },
        { status: 403 }
      );

    const existing = await loadAttempt(supabase, id, user.id);

    if (existing?.status === "submitted")
      return NextResponse.json(
        { error: "You have already submitted this test." },
        { status: 409 }
      );

    if (existing?.status === "in_progress" && existing.started_at) {
      const deadline = personalDeadline(
        existing.started_at,
        test.duration_minutes
      );
      if (now >= deadline) {
        // Their time already elapsed — finalize instead of resuming.
        await finalizeAttempt(
          test,
          existing.id,
          existing.answers as Answer[],
          deadline,
          timing
        );
        return NextResponse.json(
          { error: "Your time for this test has ended." },
          { status: 409 }
        );
      }
      const questions = await loadPublicQuestions(supabase, id);
      return NextResponse.json({
        resumed: true,
        started_at: existing.started_at,
        deadline: new Date(deadline).toISOString(),
        answers: existing.answers,
        questions,
      });
    }

    // No attempt yet → create one. The UNIQUE(quiz_id, student_id) constraint is
    // the backstop against a double-start race; on conflict we resume instead.
    // Attempt writes go through the service-role client: the browser JWT has no
    // insert policy on quiz_attempts, so an attempt can only be created server-side.
    const admin = createAdminClient();
    const startedAt = new Date(now).toISOString();
    const { data: created, error: insErr } = await admin
      .from("quiz_attempts")
      .insert({
        quiz_id: id,
        student_id: user.id,
        status: "in_progress",
        started_at: startedAt,
        answers: [],
        is_late: false,
      })
      .select("id, started_at")
      .single();

    if (insErr) {
      // 23505 = unique violation: another request created the attempt first.
      if ((insErr as { code?: string }).code === "23505") {
        const raced = await loadAttempt(supabase, id, user.id);
        if (raced?.started_at) {
          const deadline = personalDeadline(
            raced.started_at,
            test.duration_minutes
          );
          const questions = await loadPublicQuestions(supabase, id);
          return NextResponse.json({
            resumed: true,
            started_at: raced.started_at,
            deadline: new Date(deadline).toISOString(),
            answers: raced.answers,
            questions,
          });
        }
      }
      throw insErr;
    }

    const deadline = personalDeadline(created.started_at, test.duration_minutes);
    const questions = await loadPublicQuestions(supabase, id);
    return NextResponse.json({
      resumed: false,
      started_at: created.started_at,
      deadline: new Date(deadline).toISOString(),
      answers: [],
      questions,
    });
  } catch (error) {
    return handleError(error);
  }
}
