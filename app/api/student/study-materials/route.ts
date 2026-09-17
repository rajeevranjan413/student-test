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

// GET /api/student/study-materials — study material shared to the student's
// enrolled batches (optional ?batch= filter). RLS also scopes this to the student's
// non-archived, enrolled materials as defense-in-depth.
export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireStudent();
    const batchFilter = new URL(request.url).searchParams.get("batch");

    const batchIds = await enrolledBatchIds(supabase, user.id);
    if (batchIds.length === 0) return NextResponse.json([]);

    const scoped =
      batchFilter && batchIds.includes(batchFilter) ? [batchFilter] : batchIds;

    const { data, error } = await supabase
      .from("study_materials")
      .select(
        "id, batch_id, kind, title, description, file_name, file_size, mime_type, created_at, batches(name)"
      )
      .in("batch_id", scoped)
      .is("archived_at", null)
      .order("created_at", { ascending: false });
    if (error) throw error;

    const rows = (data ?? []).map((m) => {
      const batches = m.batches as { name?: string } | { name?: string }[] | null;
      const batchName = Array.isArray(batches) ? batches[0]?.name : batches?.name;
      return {
        id: m.id,
        batch_id: m.batch_id,
        batch_name: batchName ?? null,
        kind: m.kind,
        title: m.title,
        description: m.description ?? null,
        file_name: m.file_name,
        file_size: m.file_size ?? null,
        mime_type: m.mime_type ?? null,
        created_at: m.created_at,
      };
    });

    return NextResponse.json(rows);
  } catch (error) {
    return handleError(error);
  }
}
