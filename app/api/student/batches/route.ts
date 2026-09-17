import { NextResponse } from "next/server";
import { AuthError, requireStudent } from "@/utils/auth";

function handleError(error: unknown) {
  if (error instanceof AuthError)
    return NextResponse.json({ error: error.message }, { status: error.status });
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Unknown error" },
    { status: 500 }
  );
}

type BatchRow = {
  id: string;
  name: string | null;
  start_time: string | null;
  end_time: string | null;
};

// GET /api/student/batches — the batches the signed-in student is enrolled in.
// Powers the header batch switcher (shown only when a student has >1 batch) and
// is scoped to the student by RLS (student_batches: own rows; batches: enrolled).
// Public-safe fields only — never `secret_pass`.
export async function GET() {
  try {
    const { supabase, user } = await requireStudent();

    const { data, error } = await supabase
      .from("student_batches")
      .select("batches(id, name, start_time, end_time)")
      .eq("student_id", user.id);
    if (error) throw error;

    const batches = (data ?? [])
      .map((r) => {
        const b = r.batches as BatchRow | BatchRow[] | null;
        return Array.isArray(b) ? b[0] : b;
      })
      .filter((b): b is BatchRow => b != null && !!b.id)
      .map((b) => ({
        id: b.id,
        name: b.name,
        start_time: b.start_time ?? null,
        end_time: b.end_time ?? null,
      }))
      .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));

    return NextResponse.json(batches);
  } catch (error) {
    return handleError(error);
  }
}
