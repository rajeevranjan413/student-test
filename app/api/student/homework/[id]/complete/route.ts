import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireStudent } from "@/utils/auth";
import { markHomeworkDone, requireStudentHomework } from "@/utils/studentHomework";

function handleError(error: unknown) {
  if (error instanceof AuthError)
    return NextResponse.json({ error: error.message }, { status: error.status });
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Unknown error" },
    { status: 500 }
  );
}

// POST /api/student/homework/[id]/complete — mark a `file` homework as done. No
// upload back; the student just confirms they've read the PDF/image. Idempotent.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, user } = await requireStudent();
    const { id } = await params;

    const hw = await requireStudentHomework(supabase, user.id, id);
    if (hw.type !== "file")
      return NextResponse.json(
        { error: "This homework is not a mark-as-done assignment." },
        { status: 400 }
      );

    const { submittedAt } = await markHomeworkDone(id, user.id);
    return NextResponse.json({ status: "done", submitted_at: submittedAt });
  } catch (error) {
    return handleError(error);
  }
}
