import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";

/**
 * Public, no-auth student ranking. RLS restricts quiz_attempts/profiles to the
 * owning student or a teacher, so a session-less public ranking must be built with
 * the SERVICE ROLE (bypasses RLS). Only public-safe fields leave the server:
 * display name + aggregate scores — never email/phone/answers.
 *
 * Metric (see DECISIONS.md D15): rank by total points (Σ score over `submitted`
 * attempts), tie-broken by overall accuracy (Σ correct_count / Σ questions in the
 * taken tests), then earliest submission. Optional `?batch=<id>` restricts to that
 * batch's tests.
 */
export async function GET(request: Request) {
  try {
    const admin = createAdminClient();
    const batchFilter = new URL(request.url).searchParams.get("batch");

    // quiz → batch map (also the allow-list when a batch filter is applied).
    const { data: quizzes, error: qErr } = await admin
      .from("quizzes")
      .select("id, batch_id");
    if (qErr) throw qErr;
    const quizToBatch = new Map<string, string | null>();
    for (const q of quizzes ?? []) quizToBatch.set(q.id as string, (q.batch_id as string) ?? null);

    const allowedQuizIds = batchFilter
      ? (quizzes ?? [])
          .filter((q) => q.batch_id === batchFilter)
          .map((q) => q.id as string)
      : null;
    if (allowedQuizIds && allowedQuizIds.length === 0)
      return NextResponse.json({ rows: [] });

    // Submitted attempts only (score/correct_count are set at submit).
    let attemptQuery = admin
      .from("quiz_attempts")
      .select("student_id, quiz_id, score, correct_count, submitted_at")
      .eq("status", "submitted");
    if (allowedQuizIds) attemptQuery = attemptQuery.in("quiz_id", allowedQuizIds);
    const { data: attempts, error: aErr } = await attemptQuery;
    if (aErr) throw aErr;

    const rowsIn = attempts ?? [];
    if (rowsIn.length === 0) return NextResponse.json({ rows: [] });

    // Question counts per quiz (accuracy denominator) — real counts, so negative
    // marking doesn't distort accuracy the way score/max_score would.
    const quizIds = Array.from(new Set(rowsIn.map((a) => a.quiz_id as string)));
    const { data: questions, error: quesErr } = await admin
      .from("questions")
      .select("quiz_id")
      .in("quiz_id", quizIds);
    if (quesErr) throw quesErr;
    const questionCount = new Map<string, number>();
    for (const q of questions ?? []) {
      const qid = q.quiz_id as string;
      questionCount.set(qid, (questionCount.get(qid) ?? 0) + 1);
    }

    // Aggregate per student.
    type Agg = {
      points: number;
      tests: number;
      correct: number;
      questions: number;
      earliest: number; // ms epoch of earliest submission
    };
    const agg = new Map<string, Agg>();
    for (const a of rowsIn) {
      const sid = a.student_id as string;
      const cur =
        agg.get(sid) ?? { points: 0, tests: 0, correct: 0, questions: 0, earliest: Infinity };
      cur.points += a.score == null ? 0 : Number(a.score);
      cur.tests += 1;
      cur.correct += a.correct_count == null ? 0 : Number(a.correct_count);
      cur.questions += questionCount.get(a.quiz_id as string) ?? 0;
      const ts = a.submitted_at ? Date.parse(a.submitted_at) : Infinity;
      if (ts < cur.earliest) cur.earliest = ts;
      agg.set(sid, cur);
    }

    // Display names — students only, public-safe.
    const studentIds = Array.from(agg.keys());
    const { data: profiles, error: pErr } = await admin
      .from("profiles")
      .select("id, full_name, role")
      .in("id", studentIds);
    if (pErr) throw pErr;
    const nameById = new Map<string, string | null>();
    for (const p of profiles ?? []) {
      if (p.role === "student") nameById.set(p.id as string, (p.full_name as string | null) ?? null);
    }

    const ranked = studentIds
      .filter((id) => nameById.has(id)) // drop any non-student rows defensively
      .map((id) => {
        const a = agg.get(id)!;
        const accuracy =
          a.questions > 0 ? Math.round((a.correct / a.questions) * 1000) / 10 : null;
        return {
          student_id: id,
          full_name: nameById.get(id) ?? "Student",
          points: Math.round(a.points * 10) / 10,
          tests_taken: a.tests,
          accuracy,
          earliest_submission: a.earliest === Infinity ? null : new Date(a.earliest).toISOString(),
        };
      })
      .sort((x, y) => {
        if (y.points !== x.points) return y.points - x.points;
        const xa = x.accuracy ?? -1;
        const ya = y.accuracy ?? -1;
        if (ya !== xa) return ya - xa;
        const xe = x.earliest_submission ? Date.parse(x.earliest_submission) : Infinity;
        const ye = y.earliest_submission ? Date.parse(y.earliest_submission) : Infinity;
        return xe - ye;
      })
      .map((r, i) => ({ rank: i + 1, ...r }));

    return NextResponse.json({ rows: ranked });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
