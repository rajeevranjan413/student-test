// Server-only helpers shared by the student homework API routes. Everything runs
// with the student's request-scoped Supabase client and enforces "this student may
// see/do this homework": it must be published, non-archived, and belong to a batch
// the student is enrolled in. Correct answers are loaded only for scoring (service
// role) and never leaked before submission.

import type { SupabaseClient } from "@supabase/supabase-js";
import { AuthError } from "./auth";
import { createAdminClient } from "./supabase/admin";
import { enrolledBatchIds } from "./studentTests";
import { normalizeOptions, scoreAttempt, type Answer, type Option } from "./test";

export type StudentHomework = {
  id: string;
  batch_id: string;
  batch_name: string | null;
  type: "mcq" | "file";
  title: string;
  description: string | null;
  due_at: string | null;
  marks_per_question: number;
  negative_marking: number;
  file_name: string | null;
  file_size: number | null;
  mime_type: string | null;
};

export type HomeworkAttemptRow = {
  id: string;
  homework_id: string;
  student_id: string;
  status: "submitted" | "done";
  score: number | null;
  max_score: number | null;
  correct_count: number | null;
  answers: { questionId: string; optionKey: string | null }[];
  submitted_at: string;
};

export type PublicHomeworkQuestion = {
  id: string;
  text: string;
  options: Option[];
  order: number;
};

const HOMEWORK_COLUMNS =
  "id, batch_id, type, title, description, due_at, marks_per_question, negative_marking, file_name, file_size, mime_type, status, is_published, archived_at, batches(name)";

function flattenBatchName(batches: unknown): string | null {
  if (Array.isArray(batches)) return batches[0]?.name ?? null;
  if (batches && typeof batches === "object")
    return (batches as { name?: string }).name ?? null;
  return null;
}

/**
 * Load a single homework the student is allowed to see, or throw:
 *  - 404 if it doesn't exist, is archived, or isn't published
 *  - 403 if the student isn't enrolled in the homework's batch
 */
export async function requireStudentHomework(
  supabase: SupabaseClient,
  studentId: string,
  homeworkId: string
): Promise<StudentHomework> {
  const { data, error } = await supabase
    .from("homework")
    .select(HOMEWORK_COLUMNS)
    .eq("id", homeworkId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new AuthError("Homework not found.", 404);

  const visible =
    !data.archived_at && (data.is_published || data.status !== "draft");
  if (!visible) throw new AuthError("Homework not found.", 404);

  const batchIds = await enrolledBatchIds(supabase, studentId);
  if (!batchIds.includes(data.batch_id))
    throw new AuthError("You are not enrolled in this homework's batch.", 403);

  return {
    id: data.id,
    batch_id: data.batch_id,
    batch_name: flattenBatchName(data.batches),
    type: data.type,
    title: data.title,
    description: data.description ?? null,
    due_at: data.due_at ?? null,
    marks_per_question: data.marks_per_question ?? 1,
    negative_marking: Number(data.negative_marking ?? 0),
    file_name: data.file_name ?? null,
    file_size: data.file_size ?? null,
    mime_type: data.mime_type ?? null,
  };
}

/** The student's attempt for a homework, or null if they haven't done it. */
export async function loadHomeworkAttempt(
  supabase: SupabaseClient,
  homeworkId: string,
  studentId: string
): Promise<HomeworkAttemptRow | null> {
  const { data, error } = await supabase
    .from("homework_attempts")
    .select(
      "id, homework_id, student_id, status, score, max_score, correct_count, answers, submitted_at"
    )
    .eq("homework_id", homeworkId)
    .eq("student_id", studentId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    ...data,
    answers: Array.isArray(data.answers) ? data.answers : [],
  } as HomeworkAttemptRow;
}

/** MCQ questions for the take UI — WITHOUT correct answers. */
export async function loadPublicHomeworkQuestions(
  supabase: SupabaseClient,
  homeworkId: string
): Promise<PublicHomeworkQuestion[]> {
  const { data, error } = await supabase
    .from("homework_questions")
    .select("id, question_text, options, order")
    .eq("homework_id", homeworkId)
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

/** Questions WITH correct answers — server scoring / post-submit review only. */
async function loadScorableHomeworkQuestions(homeworkId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("homework_questions")
    .select("id, question_text, options, correct_answer, explanation, order")
    .eq("homework_id", homeworkId)
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

export type HomeworkReviewItem = {
  id: string;
  text: string;
  options: Option[];
  correctKey: string;
  chosenKey: string | null;
  isCorrect: boolean;
  explanation: string | null;
};

export type HomeworkResult = {
  score: number;
  maxScore: number;
  correctCount: number;
  submittedAt: string;
  review: HomeworkReviewItem[];
};

/**
 * Score and record a student's single MCQ homework attempt. Answers are trusted
 * only as *choices*, never as scores; correct answers are read here (service role)
 * and the attempt is inserted through the service role (no browser write policy on
 * homework_attempts). The UNIQUE(homework_id, student_id) constraint + this check
 * enforce the one-attempt rule.
 */
export async function submitHomeworkAttempt(
  hw: StudentHomework,
  studentId: string,
  answers: Answer[]
): Promise<HomeworkResult> {
  const questions = await loadScorableHomeworkQuestions(hw.id);
  const { score, maxScore, correctCount } = scoreAttempt(
    questions,
    answers,
    hw.marks_per_question,
    hw.negative_marking
  );
  const submittedAt = new Date().toISOString();

  const admin = createAdminClient();
  const { error } = await admin.from("homework_attempts").insert({
    homework_id: hw.id,
    student_id: studentId,
    status: "submitted",
    score,
    max_score: maxScore,
    correct_count: correctCount,
    answers,
    submitted_at: submittedAt,
  });
  if (error) {
    // 23505 = unique violation → they already submitted (one attempt only).
    if ((error as { code?: string }).code === "23505")
      throw new AuthError("You have already submitted this homework.", 409);
    throw error;
  }

  const picked = new Map(answers.map((a) => [a.questionId, a.optionKey]));
  const review: HomeworkReviewItem[] = questions.map((q) => {
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

  return { score, maxScore, correctCount, submittedAt, review };
}

/**
 * Build the post-submission review (safe to expose correct answers now) for an
 * already-submitted MCQ homework attempt. Reads answers via the service role.
 */
export async function buildHomeworkReviewFor(
  homeworkId: string,
  answers: Answer[]
): Promise<HomeworkReviewItem[]> {
  const questions = await loadScorableHomeworkQuestions(homeworkId);
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

/** Mark a `file` homework as done for a student (no upload back). Idempotent. */
export async function markHomeworkDone(
  homeworkId: string,
  studentId: string
): Promise<{ submittedAt: string }> {
  const submittedAt = new Date().toISOString();
  const admin = createAdminClient();
  const { error } = await admin.from("homework_attempts").insert({
    homework_id: homeworkId,
    student_id: studentId,
    status: "done",
    submitted_at: submittedAt,
  });
  if (error && (error as { code?: string }).code !== "23505") throw error;
  return { submittedAt };
}
