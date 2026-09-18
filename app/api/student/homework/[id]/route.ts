import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireStudent } from "@/utils/auth";
import {
  buildHomeworkReviewFor,
  loadHomeworkAttempt,
  loadPublicHomeworkQuestions,
  requireStudentHomework,
} from "@/utils/studentHomework";

function handleError(error: unknown) {
  if (error instanceof AuthError)
    return NextResponse.json({ error: error.message }, { status: error.status });
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Unknown error" },
    { status: 500 }
  );
}

// GET /api/student/homework/[id] — bootstrap the student homework page.
//  * mcq  → homework meta + questions (WITHOUT answers) + the student's attempt
//           (with a graded review once submitted).
//  * file → homework meta + the student's completion state (view/download via the
//           shared /download route).
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, user } = await requireStudent();
    const { id } = await params;

    const hw = await requireStudentHomework(supabase, user.id, id);
    const attempt = await loadHomeworkAttempt(supabase, id, user.id);

    if (hw.type === "mcq") {
      const questions = await loadPublicHomeworkQuestions(supabase, id);
      const review =
        attempt && attempt.status === "submitted"
          ? await buildHomeworkReviewFor(id, attempt.answers)
          : null;
      return NextResponse.json({
        homework: hw,
        questions,
        attempt: attempt
          ? {
              status: attempt.status,
              score: attempt.score,
              max_score: attempt.max_score,
              correct_count: attempt.correct_count,
              submitted_at: attempt.submitted_at,
            }
          : null,
        review,
      });
    }

    // file homework
    return NextResponse.json({
      homework: hw,
      questions: [],
      attempt: attempt
        ? { status: attempt.status, submitted_at: attempt.submitted_at }
        : null,
      review: null,
    });
  } catch (error) {
    return handleError(error);
  }
}
