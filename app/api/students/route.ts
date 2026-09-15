import { NextResponse } from "next/server";
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

// GET /api/students — teacher-only roster of every student: profile + contact
// (email/phone from auth.users via service role), enrolled batches, #tests
// submitted, and last activity. Powers the searchable/filterable students table.
export async function GET() {
  try {
    const { supabase } = await requireTeacher();

    // All student profiles (teacher RLS SELECT covers every profile).
    const { data: profiles, error: pErr } = await supabase
      .from("profiles")
      .select("id, full_name, created_at, role")
      .eq("role", "student");
    if (pErr) throw pErr;

    const students = profiles ?? [];
    if (students.length === 0) return NextResponse.json([]);
    const ids = students.map((s) => s.id as string);

    // Enrollments → batch list per student.
    const { data: enrollments, error: eErr } = await supabase
      .from("student_batches")
      .select("student_id, batch_id, batches(id, name)")
      .in("student_id", ids);
    if (eErr) throw eErr;
    const batchesByStudent = new Map<string, { id: string; name: string | null }[]>();
    for (const row of enrollments ?? []) {
      const sid = row.student_id as string;
      const b = row.batches as { id?: string; name?: string } | { id?: string; name?: string }[] | null;
      const flat = Array.isArray(b) ? b[0] : b;
      if (!flat?.id) continue;
      const list = batchesByStudent.get(sid) ?? [];
      list.push({ id: flat.id, name: flat.name ?? null });
      batchesByStudent.set(sid, list);
    }

    // Attempts → #submitted + last activity per student.
    const { data: attempts, error: aErr } = await supabase
      .from("quiz_attempts")
      .select("student_id, status, submitted_at, started_at")
      .in("student_id", ids);
    if (aErr) throw aErr;
    const stats = new Map<string, { taken: number; last: number }>();
    for (const a of attempts ?? []) {
      const sid = a.student_id as string;
      const cur = stats.get(sid) ?? { taken: 0, last: 0 };
      if (a.status === "submitted") cur.taken += 1;
      const ts = a.submitted_at ?? a.started_at;
      if (ts) cur.last = Math.max(cur.last, Date.parse(ts));
      stats.set(sid, cur);
    }

    // Contact details (email/phone) — teacher-only, via service role.
    const contacts = await contactsById();

    const rows = students.map((s) => {
      const id = s.id as string;
      const c = contacts.get(id);
      const st = stats.get(id);
      return {
        id,
        full_name: (s.full_name as string | null) ?? null,
        email: c?.email ?? null,
        phone: c?.phone ?? null,
        batches: batchesByStudent.get(id) ?? [],
        tests_taken: st?.taken ?? 0,
        last_activity: st?.last ? new Date(st.last).toISOString() : null,
        created_at: s.created_at ?? null,
      };
    });

    // Newest students first by default.
    rows.sort((a, b) => {
      const at = a.created_at ? Date.parse(a.created_at) : 0;
      const bt = b.created_at ? Date.parse(b.created_at) : 0;
      return bt - at;
    });

    return NextResponse.json(rows);
  } catch (error) {
    return handleError(error);
  }
}
