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

function mapRow(m: Record<string, unknown>) {
  const batches = m.batches as { name?: string } | { name?: string }[] | null;
  const batchName = Array.isArray(batches) ? batches[0]?.name : batches?.name;
  return {
    id: m.id as string,
    subject_id: (m.subject_id as string | null) ?? null,
    batch_id: m.batch_id as string,
    batch_name: batchName ?? null,
    kind: m.kind as string,
    title: m.title as string,
    description: (m.description as string | null) ?? null,
    file_name: m.file_name as string,
    file_size: (m.file_size as number | null) ?? null,
    mime_type: (m.mime_type as string | null) ?? null,
    created_at: m.created_at as string,
  };
}

// GET /api/student/study-materials — notes in a subject folder (`?subject=`, the
// folder view) or, without it, all notes in the student's enrolled batches
// (optional `?batch=`). Enrollment is re-checked: a `?subject=` is only honoured
// when its batch is one the student is enrolled in. RLS mirrors this as
// defense-in-depth (student SELECTs non-archived, enrolled rows only).
export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireStudent();
    const url = new URL(request.url);
    const subjectId = url.searchParams.get("subject");
    const batchFilter = url.searchParams.get("batch");

    const batchIds = await enrolledBatchIds(supabase, user.id);
    if (batchIds.length === 0) return NextResponse.json([]);

    let query = supabase
      .from("study_materials")
      .select(
        "id, subject_id, batch_id, kind, title, description, file_name, file_size, mime_type, created_at, batches(name)"
      )
      .is("archived_at", null)
      .order("created_at", { ascending: false });

    if (subjectId) {
      // Verify the subject exists and belongs to an enrolled batch before listing.
      const { data: subject, error: subjErr } = await supabase
        .from("subjects")
        .select("id, batch_id")
        .eq("id", subjectId)
        .is("archived_at", null)
        .maybeSingle();
      if (subjErr) throw subjErr;
      if (!subject || !batchIds.includes(subject.batch_id as string))
        return NextResponse.json([]);
      query = query.eq("subject_id", subjectId);
    } else {
      const scoped =
        batchFilter && batchIds.includes(batchFilter) ? [batchFilter] : batchIds;
      query = query.in("batch_id", scoped);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json((data ?? []).map(mapRow));
  } catch (error) {
    return handleError(error);
  }
}
