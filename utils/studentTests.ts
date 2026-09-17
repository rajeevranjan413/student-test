// Server-only helpers shared by the student take-test API routes. Everything here
// runs with the student's request-scoped Supabase client and is the single place
// that enforces "this student may see/take this test": it must be published and
// belong to a batch the student is enrolled in. Correct answers are loaded only
// where noted (scoring / post-submit review) and never leaked before submission.

import type { SupabaseClient } from "@supabase/supabase-js";
import { AuthError } from "./auth";
import { createAdminClient } from "./supabase/admin";
import {
  isLateSubmission,
  normalizeOptions,
  scoreAttempt,
  type Answer,
  type Option,
  type TestTiming,
} from "./test";

export type StudentTest = {
  id: string;
  title: string;
  status: "draft" | "published" | "closed";
  is_published: boolean;
  scheduled_at: string | null;
  duration_minutes: number;
  total_questions: number | null;
  marks_per_question: number;
  negative_marking: number;
  passing_marks: number | null;
  batch_id: string;
  batch_name: string | null;
};

export type AttemptRow = {
  id: string;
  quiz_id: string;
  student_id: string;
  status: "in_progress" | "submitted" | "missed";
  started_at: string | null;
  submitted_at: string | null;
  is_late: boolean;
  score: number | null;
  max_score: number | null;
  correct_count: number | null;
  answers: { questionId: string; optionKey: string | null }[];
};

/** A question shaped for the take UI — correct answer intentionally excluded. */
export type PublicQuestion = {
  id: string;
  text: string;
  options: Option[];
  order: number;
};

const TEST_COLUMNS =
  "id, title, status, is_published, scheduled_at, duration_minutes, marks_per_question, negative_marking, passing_marks, total_questions, batch_id, batches(name)";

function flattenBatchName(batches: unknown): string | null {
  if (Array.isArray(batches)) return batches[0]?.name ?? null;
  if (batches && typeof batches === "object")
    return (batches as { name?: string }).name ?? null;
  return null;
}

/** The set of batch ids this student is enrolled in. */
export async function enrolledBatchIds(
  supabase: SupabaseClient,
  studentId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from("student_batches")
    .select("batch_id")
    .eq("student_id", studentId);
  if (error) throw error;
  return (data ?? []).map((r) => r.batch_id as string);
}

/**
 * Load a single test the student is allowed to take, or throw:
 *  - 404 if it doesn't exist or isn't published (drafts are invisible to students)
 *  - 403 if the student isn't enrolled in the test's batch
 */
export async function requireStudentTest(
  supabase: SupabaseClient,
  studentId: string,
  testId: string
): Promise<StudentTest> {
  const { data, error } = await supabase
    .from("quizzes")
    .select(TEST_COLUMNS)
    .eq("id", testId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new AuthError("Test not found.", 404);

  const test: StudentTest = {
    id: data.id,
    title: data.title,
    status: data.status,
    is_published: data.is_published ?? false,
    scheduled_at: data.scheduled_at ?? null,
    duration_minutes: data.duration_minutes ?? 30,
    total_questions: data.total_questions ?? null,
    marks_per_question: data.marks_per_question ?? 1,
    negative_marking: Number(data.negative_marking ?? 0),
    passing_marks: data.passing_marks ?? null,
    batch_id: data.batch_id,
    batch_name: flattenBatchName(data.batches),
  };

  // Drafts must never be visible/takeable by students.
  if (test.status === "draft" || (!test.is_published && test.status !== "closed"))
    throw new AuthError("Test not found.", 404);

  const batchIds = await enrolledBatchIds(supabase, studentId);
  if (!batchIds.includes(test.batch_id))
    throw new AuthError("You are not enrolled in this test's batch.", 403);

  return test;
}

/** The student's attempt for a test, or null if they haven't started. */
export async function loadAttempt(
  supabase: SupabaseClient,
  testId: string,
  studentId: string
): Promise<AttemptRow | null> {
  const { data, error } = await supabase
    .from("quiz_attempts")
    .select(
      "id, quiz_id, student_id, status, started_at, submitted_at, is_late, score, max_score, correct_count, answers"
    )
    .eq("quiz_id", testId)
    .eq("student_id", studentId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    ...data,
    answers: Array.isArray(data.answers) ? data.answers : [],
  } as AttemptRow;
}

/** Questions for the take UI — WITHOUT correct answers. */
export async function loadPublicQuestions(
  supabase: SupabaseClient,
  testId: string
): Promise<PublicQuestion[]> {
  const { data, error } = await supabase
    .from("questions")
    .select("id, question_text, options, order")
    .eq("quiz_id", testId)
    .order("order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((q, i) => ({
    id: q.id,
    text: q.question_text,
    options: normalizeOptions(q.options),
    order: q.order ?? i,
  }));
}

/**
 * Questions WITH correct answers + explanation — server scoring / post-submit
 * review only. `correct_answer`/`explanation` are column-REVOKEd from the browser
 * JWT, so this MUST use the service-role client (which bypasses RLS + column
 * grants). It is the single place answers are read; never call it before submit.
 */
export async function loadScorableQuestions(testId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("questions")
    .select("id, question_text, options, correct_answer, explanation, order")
    .eq("quiz_id", testId)
    .order("order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((q, i) => ({
    id: q.id as string,
    text: q.question_text as string,
    options: normalizeOptions(q.options),
    correct_answer: q.correct_answer as string,
    explanation: (q.explanation as string | null) ?? null,
    order: (q.order as number | null) ?? i,
  }));
}

export type ScorableQuestionFull = Awaited<
  ReturnType<typeof loadScorableQuestions>
>[number];

/** Per-question review shown AFTER submission (safe to expose correct answers now). */
export type ReviewItem = {
  id: string;
  text: string;
  options: Option[];
  correctKey: string;
  chosenKey: string | null;
  isCorrect: boolean;
  explanation: string | null;
};

export function buildReview(
  questions: ScorableQuestionFull[],
  answers: Answer[]
): ReviewItem[] {
  const picked = new Map(answers.map((a) => [a.questionId, a.optionKey]));
  return questions.map((q) => {
    const chosenKey = picked.get(q.id) ?? null;
    return {
      id: q.id,
      text: q.text,
      options: q.options,
      correctKey: q.correct_answer,
      chosenKey,
      isCorrect: chosenKey != null && chosenKey === q.correct_answer,
      explanation: q.explanation,
    };
  });
}

export type FinalizeResult = {
  score: number;
  maxScore: number;
  correctCount: number;
  isLate: boolean;
  submittedAt: string;
  review: ReviewItem[];
};

/**
 * Score and finalize an in-progress attempt — the single authoritative path for
 * turning answers into a graded, submitted attempt. Shared by the explicit
 * submit route and the lazy auto-submit that fires when a student's window has
 * elapsed. Scoring reads correct answers here only; the answer list is trusted
 * only as *choices*, never as scores.
 */
export async function finalizeAttempt(
  test: StudentTest,
  attemptId: string,
  answers: Answer[],
  submittedAtMs: number,
  timing: TestTiming
): Promise<FinalizeResult> {
  const questions = await loadScorableQuestions(test.id);
  const { score, maxScore, correctCount } = scoreAttempt(
    questions,
    answers,
    test.marks_per_question,
    test.negative_marking
  );
  const isLate = isLateSubmission(submittedAtMs, timing);
  const submittedAt = new Date(submittedAtMs).toISOString();

  // Attempt writes go through the service-role client: the browser JWT has no
  // write policy on quiz_attempts, so scoring can only ever be written server-side.
  const admin = createAdminClient();
  const { error } = await admin
    .from("quiz_attempts")
    .update({
      status: "submitted",
      submitted_at: submittedAt,
      is_late: isLate,
      score,
      max_score: maxScore,
      correct_count: correctCount,
      answers,
    })
    .eq("id", attemptId)
    .eq("status", "in_progress"); // never re-finalize a submitted attempt
  if (error) throw error;

  return {
    score,
    maxScore,
    correctCount,
    isLate,
    submittedAt,
    review: buildReview(questions, answers),
  };
}
