import { NextResponse } from "next/server";
import { AuthError, requireStudent } from "@/utils/auth";
import { enrolledBatchIds } from "@/utils/studentTests";
import { filesByParent } from "@/utils/files";
import type { StudentHomeworkItem } from "@/utils/homework";

function handleError(error: unknown) {
  if (error instanceof AuthError)
    return NextResponse.json({ error: error.message }, { status: error.status });
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Unknown error" },
    { status: 500 }
  );
}

// GET /api/student/homework — published, non-archived homework in the student's
// enrolled batches (optional ?batch=), each with the student's own attempt state.
export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireStudent();
    const batchFilter = new URL(request.url).searchParams.get("batch");

    const batchIds = await enrolledBatchIds(supabase, user.id);
    if (batchIds.length === 0) return NextResponse.json([]);
    const scoped =
      batchFilter && batchIds.includes(batchFilter) ? [batchFilter] : batchIds;

    const { data, error } = await supabase
      .from("homework")
      .select(
        "id, batch_id, type, title, description, due_at, created_at, updated_at, batches(name), homework_questions(count)"
      )
      .in("batch_id", scoped)
      .is("archived_at", null)
      .or("is_published.eq.true,status.neq.draft")
      .order("created_at", { ascending: false });
    if (error) throw error;

    const rows = data ?? [];
    const filesById = await filesByParent(
      supabase,
      "homework_files",
      rows.filter((r) => r.type === "file").map((r) => r.id as string)
    );

    // The student's own attempts for these homework rows (RLS scopes to own rows).
    const ids = rows.map((r) => r.id as string);
    const attemptByHw = new Map<string, StudentHomeworkItem["attempt"]>();
    if (ids.length > 0) {
      const { data: attempts, error: aErr } = await supabase
        .from("homework_attempts")
        .select("homework_id, status, score, max_score, correct_count, submitted_at")
        .eq("student_id", user.id)
        .in("homework_id", ids);
      if (aErr) throw aErr;
      for (const a of attempts ?? []) {
        attemptByHw.set(a.homework_id as string, {
          status: a.status as "submitted" | "done",
          score: (a.score as number | null) ?? null,
          max_score: (a.max_score as number | null) ?? null,
          correct_count: (a.correct_count as number | null) ?? null,
          submitted_at: a.submitted_at as string,
        });
      }
    }

    const items: StudentHomeworkItem[] = rows.map((h) => {
      const batches = h.batches as { name?: string } | { name?: string }[] | null;
      const batchName = Array.isArray(batches) ? batches[0]?.name : batches?.name;
      const counts = h.homework_questions as { count?: number }[] | null;
      return {
        id: h.id as string,
        batch_id: h.batch_id as string,
        batch_name: batchName ?? null,
        type: h.type as "mcq" | "file",
        title: h.title as string,
        description: (h.description as string | null) ?? null,
        due_at: (h.due_at as string | null) ?? null,
        question_count: counts?.[0]?.count ?? 0,
        files: filesById.get(h.id as string) ?? [],
        created_at: h.created_at as string,
        updated_at: (h.updated_at as string | null) ?? null,
        attempt: attemptByHw.get(h.id as string) ?? null,
      };
    });

    return NextResponse.json(items);
  } catch (error) {
    return handleError(error);
  }
}
