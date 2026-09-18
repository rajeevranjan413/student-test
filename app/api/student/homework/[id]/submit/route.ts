import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireStudent } from "@/utils/auth";
import type { Answer } from "@/utils/test";
import {
  loadHomeworkAttempt,
  requireStudentHomework,
  submitHomeworkAttempt,
} from "@/utils/studentHomework";

function handleError(error: unknown) {
  if (error instanceof AuthError)
    return NextResponse.json({ error: error.message }, { status: error.status });
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Unknown error" },
    { status: 500 }
  );
}

// POST /api/student/homework/[id]/submit — grade & record an MCQ homework attempt.
// One attempt only (unique constraint + a pre-check). Scoring is server-side.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, user } = await requireStudent();
    const { id } = await params;

    const hw = await requireStudentHomework(supabase, user.id, id);
    if (hw.type !== "mcq")
      return NextResponse.json(
        { error: "This homework has no questions to submit." },
        { status: 400 }
      );

    // Single-attempt guard (the DB unique constraint is the backstop).
    const existing = await loadHomeworkAttempt(supabase, id, user.id);
    if (existing)
      return NextResponse.json(
        { error: "You have already submitted this homework." },
        { status: 409 }
      );

    const body = await request.json().catch(() => ({}));
    const rawAnswers = Array.isArray(body?.answers) ? body.answers : [];
    const answers: Answer[] = rawAnswers
      .filter((a: unknown) => a && typeof a === "object")
      .map((a: { questionId?: unknown; optionKey?: unknown }) => ({
        questionId: String(a.questionId ?? ""),
        optionKey:
          a.optionKey == null || a.optionKey === "" ? null : String(a.optionKey),
      }))
      .filter((a: Answer) => a.questionId);

    const result = await submitHomeworkAttempt(hw, user.id, answers);
    return NextResponse.json(result);
  } catch (error) {
    return handleError(error);
  }
}
