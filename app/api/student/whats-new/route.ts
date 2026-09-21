import { NextResponse } from "next/server";
import { AuthError, requireStudent } from "@/utils/auth";
import { enrolledBatchIds } from "@/utils/studentTests";
import {
  itemSignature,
  subjectSignature,
  type NewItem,
} from "@/utils/whatsNew";

function handleError(error: unknown) {
  if (error instanceof AuthError)
    return NextResponse.json({ error: error.message }, { status: error.status });
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Unknown error" },
    { status: 500 }
  );
}

// GET /api/student/whats-new — lightweight activity signatures for the student's
// three sections (tests / homework / study), powering the home-card alert counts
// (F16). Returns only { id, sig } per item — no titles, answers or private data. The
// browser diffs these against what it has already seen (localStorage) to badge the
// unseen. Scoped to the student's enrolled batches; mirrors each list endpoint's
// visibility filters so the counts match what they'll find inside.
export async function GET() {
  try {
    const { supabase, user } = await requireStudent();

    const batchIds = await enrolledBatchIds(supabase, user.id);
    if (batchIds.length === 0)
      return NextResponse.json({ tests: [], homework: [], study: [] });

    // Tests — same visibility as GET /api/student/tests.
    const testsP = supabase
      .from("quizzes")
      .select("id, created_at, updated_at")
      .in("batch_id", batchIds)
      .is("archived_at", null)
      .or("status.eq.published,status.eq.closed,is_published.eq.true");

    // Homework — same visibility as GET /api/student/homework.
    const homeworkP = supabase
      .from("homework")
      .select("id, created_at, updated_at")
      .in("batch_id", batchIds)
      .is("archived_at", null)
      .or("is_published.eq.true,status.neq.draft");

    // Study — subject folders + their latest note activity (see below).
    const subjectsP = supabase
      .from("subjects")
      .select("id")
      .in("batch_id", batchIds)
      .is("archived_at", null);

    const [testsRes, homeworkRes, subjectsRes] = await Promise.all([
      testsP,
      homeworkP,
      subjectsP,
    ]);
    if (testsRes.error) throw testsRes.error;
    if (homeworkRes.error) throw homeworkRes.error;
    if (subjectsRes.error) throw subjectsRes.error;

    const tests: NewItem[] = (testsRes.data ?? []).map((r) => ({
      id: r.id as string,
      sig: itemSignature(r),
    }));
    const homework: NewItem[] = (homeworkRes.data ?? []).map((r) => ({
      id: r.id as string,
      sig: itemSignature(r),
    }));

    // For study, a folder's signature folds in its latest note activity + note count,
    // so adding/editing a note marks the folder "updated" (mirrors the subject list).
    const subjectIds = (subjectsRes.data ?? []).map((s) => s.id as string);
    const latest = new Map<string, number>();
    const counts = new Map<string, number>();
    if (subjectIds.length > 0) {
      const { data: notes, error: nErr } = await supabase
        .from("study_materials")
        .select("subject_id, created_at, updated_at")
        .in("subject_id", subjectIds)
        .is("archived_at", null);
      if (nErr) throw nErr;
      for (const n of notes ?? []) {
        const sid = (n as { subject_id: string | null }).subject_id;
        if (!sid) continue;
        counts.set(sid, (counts.get(sid) ?? 0) + 1);
        const ts = Number(itemSignature(n));
        if (ts > (latest.get(sid) ?? 0)) latest.set(sid, ts);
      }
    }
    const study: NewItem[] = subjectIds.map((id) => ({
      id,
      sig: subjectSignature(
        latest.has(id) ? new Date(latest.get(id) as number).toISOString() : null,
        counts.get(id) ?? 0
      ),
    }));

    return NextResponse.json({ tests, homework, study });
  } catch (error) {
    return handleError(error);
  }
}
