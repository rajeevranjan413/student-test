import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireTeacher } from "@/utils/auth";
import { createAdminClient } from "@/utils/supabase/admin";

function handleError(error: unknown) {
  if (error instanceof AuthError)
    return NextResponse.json({ error: error.message }, { status: error.status });
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Unknown error" },
    { status: 500 }
  );
}

// Confirm the batch belongs to the caller (404 if not, to avoid leaking existence)
// and that the target profile is a student. Returns nothing on success or a
// NextResponse to short-circuit on failure.
async function guard(
  supabase: Awaited<ReturnType<typeof requireTeacher>>["supabase"],
  userId: string,
  batchId: string,
  studentId: unknown
): Promise<{ ok: true; studentId: string } | { ok: false; res: NextResponse }> {
  if (typeof studentId !== "string" || !studentId)
    return {
      ok: false,
      res: NextResponse.json({ error: "student_id is required" }, { status: 400 }),
    };

  const { data: batch, error: bErr } = await supabase
    .from("batches")
    .select("id, teacher_id")
    .eq("id", batchId)
    .maybeSingle();
  if (bErr) throw bErr;
  if (!batch || batch.teacher_id !== userId)
    return {
      ok: false,
      res: NextResponse.json({ error: "Batch not found." }, { status: 404 }),
    };

  const { data: profile, error: pErr } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", studentId)
    .maybeSingle();
  if (pErr) throw pErr;
  if (!profile || profile.role !== "student")
    return {
      ok: false,
      res: NextResponse.json({ error: "Student not found." }, { status: 404 }),
    };

  return { ok: true, studentId };
}

// POST /api/batches/[id]/students — enroll a student. Service role: student_batches
// has an RLS SELECT policy but no browser write policy (see enable_rls migration).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, user } = await requireTeacher();
    const { id } = await params;
    const { student_id } = await request.json();

    const g = await guard(supabase, user.id, id, student_id);
    if (!g.ok) return g.res;

    const admin = createAdminClient();
    const { error } = await admin
      .from("student_batches")
      .insert({ student_id: g.studentId, batch_id: id });
    // 23505 = unique violation → already enrolled; treat as success (idempotent).
    if (error && (error as { code?: string }).code !== "23505") throw error;

    return NextResponse.json({ message: "Student enrolled" });
  } catch (error) {
    return handleError(error);
  }
}

// DELETE /api/batches/[id]/students — remove a student. Hard-deletes the junction
// row: the enrollment link has no history of its own (results live in quiz_attempts).
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, user } = await requireTeacher();
    const { id } = await params;
    const { student_id } = await request.json();

    const g = await guard(supabase, user.id, id, student_id);
    if (!g.ok) return g.res;

    const admin = createAdminClient();
    const { error } = await admin
      .from("student_batches")
      .delete()
      .eq("batch_id", id)
      .eq("student_id", g.studentId);
    if (error) throw error;

    return NextResponse.json({ message: "Student removed" });
  } catch (error) {
    return handleError(error);
  }
}
