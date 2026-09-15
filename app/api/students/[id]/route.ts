import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireTeacher } from "@/utils/auth";
import { contactFor } from "@/utils/students";
import { computePhase, computeTiming, deriveOutcome } from "@/utils/test";

function handleError(error: unknown) {
  if (error instanceof AuthError)
    return NextResponse.json({ error: error.message }, { status: error.status });
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Unknown error" },
    { status: 500 }
  );
}

type AttemptRecord = {
  quiz_id: string;
  status: "in_progress" | "submitted" | "missed";
  started_at: string | null;
  submitted_at: string | null;
  is_late: boolean | null;
  score: number | null;
  max_score: number | null;
  correct_count: number | null;
};

// GET /api/students/[id] — teacher-only student detail: profile + contact,
// enrolled batches, and the full test history (every published test in the
// student's batches) with on-time/late/missed outcome + score. Read-only; the
// history covers non-attempted tests too, so missed tests surface.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase } = await requireTeacher();
    const { id } = await params;

    // Profile — must be a student (404 otherwise, don't leak teachers here).
    const { data: profile, error: pErr } = await supabase
      .from("profiles")
      .select("id, full_name, created_at, role")
      .eq("id", id)
      .maybeSingle();
    if (pErr) throw pErr;
    if (!profile || profile.role !== "student")
      return NextResponse.json({ error: "Student not found." }, { status: 404 });

    // Enrolled batches.
    const { data: enrollments, error: eErr } = await supabase
      .from("student_batches")
      .select("batch_id, batches(id, name, course)")
      .eq("student_id", id);
    if (eErr) throw eErr;
    const batches = (enrollments ?? [])
      .map((row) => {
        const b = row.batches as
          | { id?: string; name?: string; course?: string }
          | { id?: string; name?: string; course?: string }[]
          | null;
        const flat = Array.isArray(b) ? b[0] : b;
        return flat?.id
          ? { id: flat.id, name: flat.name ?? null, course: flat.course ?? null }
          : null;
      })
      .filter((b): b is { id: string; name: string | null; course: string | null } => b != null);
    const batchIds = batches.map((b) => b.id);

    // Published/closed tests in those batches (the student's assignable set).
    let quizzes: {
      id: string;
      title: string;
      scheduled_at: string | null;
      duration_minutes: number | null;
      passing_marks: number | null;
      batch_id: string;
      batches: { name?: string } | { name?: string }[] | null;
    }[] = [];
    if (batchIds.length > 0) {
      const { data: q, error: qErr } = await supabase
        .from("quizzes")
        .select(
          "id, title, scheduled_at, duration_minutes, passing_marks, batch_id, batches(name)"
        )
        .in("batch_id", batchIds)
        .or("status.eq.published,status.eq.closed,is_published.eq.true")
        .order("scheduled_at", { ascending: false });
      if (qErr) throw qErr;
      quizzes = (q ?? []) as typeof quizzes;
    }

    // The student's attempts, keyed by quiz.
    const { data: attempts, error: aErr } = await supabase
      .from("quiz_attempts")
      .select(
        "quiz_id, status, started_at, submitted_at, is_late, score, max_score, correct_count"
      )
      .eq("student_id", id);
    if (aErr) throw aErr;
    const byQuiz = new Map<string, AttemptRecord>(
      (attempts ?? []).map((a) => [
        a.quiz_id as string,
        {
          quiz_id: a.quiz_id as string,
          status: a.status,
          started_at: a.started_at ?? null,
          submitted_at: a.submitted_at ?? null,
          is_late: a.is_late ?? null,
          score: a.score == null ? null : Number(a.score),
          max_score: a.max_score == null ? null : Number(a.max_score),
          correct_count: a.correct_count ?? null,
        },
      ])
    );

    const now = Date.now();
    const history = quizzes.map((q) => {
      const phase = q.scheduled_at
        ? computePhase(computeTiming(q.scheduled_at, q.duration_minutes ?? 30), now)
        : "upcoming";
      const attempt = byQuiz.get(q.id);
      const outcome = deriveOutcome(attempt, phase);
      const submitted = attempt?.status === "submitted";
      const score = submitted ? attempt!.score : null;
      const maxScore = submitted ? attempt!.max_score : null;
      const percent =
        submitted && maxScore && maxScore > 0
          ? Math.round(((score ?? 0) / maxScore) * 1000) / 10
          : null;
      const bn = q.batches as { name?: string } | { name?: string }[] | null;
      const batchName = Array.isArray(bn) ? bn[0]?.name : bn?.name;
      return {
        test_id: q.id,
        title: q.title,
        batch_name: batchName ?? null,
        scheduled_at: q.scheduled_at ?? null,
        outcome,
        started_at: attempt?.started_at ?? null,
        submitted_at: attempt?.submitted_at ?? null,
        is_late: attempt?.is_late ?? false,
        score,
        max_score: maxScore,
        percent,
        passed:
          submitted && q.passing_marks != null ? (score ?? 0) >= q.passing_marks : null,
      };
    });

    const summary = {
      assigned: history.length,
      submitted: history.filter((h) => h.outcome === "on_time" || h.outcome === "late").length,
      on_time: history.filter((h) => h.outcome === "on_time").length,
      late: history.filter((h) => h.outcome === "late").length,
      missed: history.filter((h) => h.outcome === "missed").length,
    };
    const scored = history.filter((h) => h.percent != null);
    const averagePercent =
      scored.length > 0
        ? Math.round(
            (scored.reduce((s, h) => s + (h.percent ?? 0), 0) / scored.length) * 10
          ) / 10
        : null;

    const contact = await contactFor(id);

    return NextResponse.json({
      student: {
        id: profile.id,
        full_name: (profile.full_name as string | null) ?? null,
        email: contact.email,
        phone: contact.phone,
        created_at: profile.created_at ?? null,
      },
      batches,
      history,
      summary: { ...summary, average_percent: averagePercent },
    });
  } catch (error) {
    return handleError(error);
  }
}
