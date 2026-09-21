import { NextResponse } from "next/server";
import { AuthError, requireTeacher } from "@/utils/auth";
import { notifyBatchStudents } from "@/utils/push";

type IncomingOption = { key: string; text: string };
type IncomingQuestion = {
  text: string;
  options: IncomingOption[];
  correctOptionKey: string;
  explanation?: string;
  difficulty?: string;
};

function handleError(error: unknown) {
  if (error instanceof AuthError)
    return NextResponse.json({ error: error.message }, { status: error.status });
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Unknown error" },
    { status: 500 }
  );
}

// GET /api/tests — list the teacher's tests with batch name + question count.
export async function GET() {
  try {
    const { supabase, user } = await requireTeacher();

    const { data, error } = await supabase
      .from("quizzes")
      .select(
        "id, title, scheduled_at, duration_minutes, total_questions, status, is_published, created_at, batch_id, batches(name), questions(count)"
      )
      .eq("teacher_id", user.id)
      .is("archived_at", null) // hide soft-deleted tests (D22)
      .order("created_at", { ascending: false });

    if (error) throw error;

    // Flatten the joined shape for the UI.
    const rows = (data ?? []).map((q) => {
      const batches = q.batches as { name?: string } | { name?: string }[] | null;
      const batchName = Array.isArray(batches) ? batches[0]?.name : batches?.name;
      const questions = q.questions as { count?: number }[] | null;
      return {
        id: q.id,
        title: q.title,
        scheduled_at: q.scheduled_at,
        duration_minutes: q.duration_minutes,
        total_questions: q.total_questions,
        status: q.status,
        is_published: q.is_published,
        created_at: q.created_at,
        batch_id: q.batch_id,
        batch_name: batchName ?? null,
        question_count: questions?.[0]?.count ?? 0,
      };
    });

    return NextResponse.json(rows);
  } catch (error) {
    return handleError(error);
  }
}

// POST /api/tests — persist a test + its approved questions.
export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireTeacher();
    const body = await request.json();
    const {
      title,
      batchId,
      scheduledAt,
      durationMinutes,
      totalQuestions,
      marksPerQuestion,
      negativeMarking,
      passingMarks,
      status,
      questions,
    } = body as {
      title?: string;
      batchId?: string;
      scheduledAt?: string;
      durationMinutes?: number;
      totalQuestions?: number;
      marksPerQuestion?: number;
      negativeMarking?: number;
      passingMarks?: number;
      status?: "draft" | "published";
      questions?: IncomingQuestion[];
    };

    // --- Validation ---
    if (!title?.trim()) return bad("A test title is required.");
    if (!batchId) return bad("A batch must be selected.");
    if (!scheduledAt) return bad("A scheduled date & time is required.");
    if (!Array.isArray(questions) || questions.length === 0)
      return bad("At least one approved question is required.");

    // Verify the batch belongs to this teacher (no cross-teacher writes).
    const { data: batch, error: batchErr } = await supabase
      .from("batches")
      .select("id, teacher_id")
      .eq("id", batchId)
      .single();
    if (batchErr || !batch) return bad("Selected batch was not found.", 404);
    if (batch.teacher_id !== user.id)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const publish = status !== "draft";

    // --- Insert the quiz (test) ---
    const { data: quiz, error: quizErr } = await supabase
      .from("quizzes")
      .insert({
        title: title.trim(),
        batch_id: batchId,
        teacher_id: user.id,
        scheduled_at: scheduledAt,
        duration_minutes: durationMinutes ?? 30,
        total_questions: totalQuestions ?? questions.length,
        marks_per_question: marksPerQuestion ?? 1,
        negative_marking: negativeMarking ?? 0,
        passing_marks: passingMarks ?? null,
        status: publish ? "published" : "draft",
        is_published: publish,
      })
      .select()
      .single();
    if (quizErr) throw quizErr;

    // --- Insert the approved questions ---
    const rows = questions.map((q, i) => ({
      quiz_id: quiz.id,
      question_text: q.text,
      options: q.options, // jsonb: [{ key, text }]
      correct_answer: q.correctOptionKey,
      explanation: q.explanation ?? null,
      difficulty: q.difficulty ?? null,
      order: i,
    }));

    const { error: qErr } = await supabase.from("questions").insert(rows);
    if (qErr) {
      // Roll back the quiz so we never leave a test with no questions.
      await supabase.from("quizzes").delete().eq("id", quiz.id);
      throw qErr;
    }

    // Notify enrolled students of a newly-published test (F15; best-effort). The
    // "test is live" reminder at scheduled_at is fired separately by the cron.
    if (publish) {
      await notifyBatchStudents(batchId, {
        type: "test_published",
        refId: quiz.id as string,
        title: "New test scheduled",
        body: title.trim(),
        url: `/student/tests/${quiz.id as string}`,
      });
    }

    return NextResponse.json({ id: quiz.id, status: quiz.status });
  } catch (error) {
    return handleError(error);
  }
}

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
