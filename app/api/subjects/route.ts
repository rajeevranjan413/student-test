import { NextResponse } from "next/server";
import { AuthError, requireTeacher } from "@/utils/auth";

function handleError(error: unknown) {
  if (error instanceof AuthError)
    return NextResponse.json({ error: error.message }, { status: error.status });
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Unknown error" },
    { status: 500 }
  );
}

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

// Count non-archived notes per subject (one query, tallied in JS — supabase-js has
// no group-by; the embedded `count` aggregate can't filter out archived rows).
async function noteCounts(
  supabase: Awaited<ReturnType<typeof requireTeacher>>["supabase"],
  subjectIds: string[]
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (subjectIds.length === 0) return counts;
  const { data, error } = await supabase
    .from("study_materials")
    .select("subject_id")
    .in("subject_id", subjectIds)
    .is("archived_at", null);
  if (error) throw error;
  for (const n of data ?? []) {
    const sid = (n as { subject_id: string | null }).subject_id;
    if (sid) counts.set(sid, (counts.get(sid) ?? 0) + 1);
  }
  return counts;
}

// GET /api/subjects — the teacher's subjects (optional ?batch=), with note counts.
export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireTeacher();
    const batchId = new URL(request.url).searchParams.get("batch");

    let query = supabase
      .from("subjects")
      .select("id, batch_id, name, created_at, batches(name)")
      .eq("teacher_id", user.id)
      .is("archived_at", null)
      .order("created_at", { ascending: true });

    if (batchId) query = query.eq("batch_id", batchId);

    const { data, error } = await query;
    if (error) throw error;

    const counts = await noteCounts(
      supabase,
      (data ?? []).map((s) => s.id)
    );

    const rows = (data ?? []).map((s) => {
      const batches = s.batches as { name?: string } | { name?: string }[] | null;
      const batchName = Array.isArray(batches) ? batches[0]?.name : batches?.name;
      return {
        id: s.id,
        batch_id: s.batch_id,
        batch_name: batchName ?? null,
        name: s.name,
        note_count: counts.get(s.id) ?? 0,
        created_at: s.created_at,
      };
    });

    return NextResponse.json(rows);
  } catch (error) {
    return handleError(error);
  }
}

// POST /api/subjects — add a subject to one of the teacher's batches.
export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireTeacher();
    const body = await request.json().catch(() => ({}));
    const name = String(body.name ?? "").trim();
    const batchId = String(body.batchId ?? "").trim();

    if (!name) return bad("A subject name is required.");
    if (!batchId) return bad("A batch must be selected.");

    // Verify the batch belongs to this teacher (no cross-teacher subjects).
    const { data: batch, error: batchErr } = await supabase
      .from("batches")
      .select("id, teacher_id")
      .eq("id", batchId)
      .maybeSingle();
    if (batchErr) throw batchErr;
    if (!batch) return bad("Selected batch was not found.", 404);
    if (batch.teacher_id !== user.id)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { data: row, error: insErr } = await supabase
      .from("subjects")
      .insert({ batch_id: batchId, teacher_id: user.id, name })
      .select("id")
      .single();
    if (insErr) throw insErr;

    return NextResponse.json({ id: row.id });
  } catch (error) {
    return handleError(error);
  }
}
