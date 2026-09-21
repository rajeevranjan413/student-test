import { NextResponse } from "next/server";
import { AuthError, requireStudent } from "@/utils/auth";
import { enrolledBatchIds } from "@/utils/studentTests";

function handleError(error: unknown) {
  if (error instanceof AuthError)
    return NextResponse.json({ error: error.message }, { status: error.status });
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Unknown error" },
    { status: 500 }
  );
}

// GET /api/student/subjects — subject folders in the student's enrolled batches
// (optional ?batch= filter), each with a non-archived note count. RLS also scopes
// `subjects` to the student's enrolled, non-archived rows as defense-in-depth.
export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireStudent();
    const batchFilter = new URL(request.url).searchParams.get("batch");

    const batchIds = await enrolledBatchIds(supabase, user.id);
    if (batchIds.length === 0) return NextResponse.json([]);

    const scoped =
      batchFilter && batchIds.includes(batchFilter) ? [batchFilter] : batchIds;

    const { data, error } = await supabase
      .from("subjects")
      .select("id, batch_id, name, created_at, batches(name)")
      .in("batch_id", scoped)
      .is("archived_at", null)
      .order("name", { ascending: true });
    if (error) throw error;

    // Non-archived note counts + latest activity per subject (tallied in JS — no
    // group-by in supabase-js). `activity_at` powers the F16 "new notes" indicator.
    const subjectIds = (data ?? []).map((s) => s.id);
    const counts = new Map<string, number>();
    const latest = new Map<string, number>();
    if (subjectIds.length > 0) {
      const { data: notes, error: nErr } = await supabase
        .from("study_materials")
        .select("subject_id, created_at, updated_at")
        .in("subject_id", subjectIds)
        .is("archived_at", null);
      if (nErr) throw nErr;
      for (const n of notes ?? []) {
        const note = n as {
          subject_id: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        const sid = note.subject_id;
        if (!sid) continue;
        counts.set(sid, (counts.get(sid) ?? 0) + 1);
        const ts = Math.max(
          note.created_at ? Date.parse(note.created_at) : 0,
          note.updated_at ? Date.parse(note.updated_at) : 0
        );
        if (ts > (latest.get(sid) ?? 0)) latest.set(sid, ts);
      }
    }

    const rows = (data ?? []).map((s) => {
      const batches = s.batches as { name?: string } | { name?: string }[] | null;
      const batchName = Array.isArray(batches) ? batches[0]?.name : batches?.name;
      const ts = latest.get(s.id);
      return {
        id: s.id,
        batch_id: s.batch_id,
        batch_name: batchName ?? null,
        name: s.name,
        note_count: counts.get(s.id) ?? 0,
        created_at: s.created_at,
        activity_at: ts ? new Date(ts).toISOString() : null,
      };
    });

    return NextResponse.json(rows);
  } catch (error) {
    return handleError(error);
  }
}
