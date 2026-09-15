import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireTeacher } from "@/utils/auth";
import { contactsById } from "@/utils/students";

function handleError(error: unknown) {
  if (error instanceof AuthError)
    return NextResponse.json({ error: error.message }, { status: error.status });
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Unknown error" },
    { status: 500 }
  );
}

// 1. READ SINGLE (GET) — teacher only.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase } = await requireTeacher();
    const { id } = await params;

    const { data: batch, error } = await supabase
      .from("batches")
      .select("*")
      .eq("id", id)
      .single();
    if (error) throw error;

    // Enrolled students (join student_batches → profiles; teacher SELECT policy).
    const { data: enrollments, error: eErr } = await supabase
      .from("student_batches")
      .select("student_id, profiles(id, full_name)")
      .eq("batch_id", id);
    if (eErr) throw eErr;
    const enrolled = (enrollments ?? [])
      .map((row) => {
        const p = row.profiles as
          | { id?: string; full_name?: string }
          | { id?: string; full_name?: string }[]
          | null;
        const flat = Array.isArray(p) ? p[0] : p;
        return flat?.id ? { id: flat.id, full_name: flat.full_name ?? null } : null;
      })
      .filter((s): s is { id: string; full_name: string | null } => s != null);
    const enrolledIds = new Set(enrolled.map((s) => s.id));

    // All students → split into "available" (not enrolled) for the add picker.
    const { data: allStudents, error: sErr } = await supabase
      .from("profiles")
      .select("id, full_name")
      .eq("role", "student");
    if (sErr) throw sErr;

    // Contact details (email/phone) — teacher-only, via service role.
    const contacts = await contactsById();

    const students = enrolled.map((s) => ({
      id: s.id,
      full_name: s.full_name,
      email: contacts.get(s.id)?.email ?? null,
      phone: contacts.get(s.id)?.phone ?? null,
    }));
    const available_students = (allStudents ?? [])
      .filter((s) => !enrolledIds.has(s.id as string))
      .map((s) => ({
        id: s.id as string,
        full_name: (s.full_name as string | null) ?? null,
        email: contacts.get(s.id as string)?.email ?? null,
      }));

    // The batch's tests.
    const { data: tests, error: tErr } = await supabase
      .from("quizzes")
      .select("id, title, status, scheduled_at")
      .eq("batch_id", id)
      .order("scheduled_at", { ascending: false });
    if (tErr) throw tErr;

    return NextResponse.json({
      ...batch,
      students,
      available_students,
      tests: tests ?? [],
    });
  } catch (error) {
    return handleError(error);
  }
}

// 3. UPDATE (PUT) — teacher only.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase } = await requireTeacher();
    const { id } = await params;
    const { name, course, secret_pass, description, exam_level } =
      await request.json();

    const { data, error } = await supabase
      .from("batches")
      .update({ name, course, secret_pass, description, exam_level })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    return handleError(error);
  }
}

// 4. ARCHIVE (DELETE) — teacher only. Soft-delete to preserve results/history.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase } = await requireTeacher();
    const { id } = await params;

    const { error } = await supabase
      .from("batches")
      .update({ status: "archived", archived_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;

    return NextResponse.json({ message: "Batch archived successfully" });
  } catch (error) {
    return handleError(error);
  }
}
