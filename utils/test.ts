// Server-authoritative timing + scoring for the student take-test flow.
//
// These are PURE functions (no Next/Supabase imports) so the same rules run on
// the server (enforcement of record) and on the client (countdown display only).
// The client is never trusted: the window lock, single-attempt guard, late flag
// and score are all recomputed server-side in the API routes.
//
// Timing model (see DECISIONS.md D10, revised in D21):
//   opensAt  = scheduled_at
//   dueAt    = scheduled_at + duration_minutes        (the on-time deadline)
//   closesAt = dueAt        + LATE_GRACE_MINUTES       (informational only)
// A student may START any time once now ≥ opensAt, for as long as the quiz is
// published — there is NO time-based hard lock. The only lock is the teacher
// closing the test (quiz status 'closed'). Their personal deadline is
// started_at + duration (full duration, however late they start). A submission is
// `is_late` when it lands after dueAt. If the teacher closes the test with no
// submission the attempt is `missed`. `closesAt` no longer gates anything; it is
// kept only as an informational marker in the reporting JSON.

import { LATE_GRACE_MINUTES } from "./constants";

export type QuizStatus = "draft" | "published" | "closed";
export type AttemptStatus = "in_progress" | "submitted" | "missed";

/** The phase of a test relative to its scheduled window. */
export type TestPhase = "upcoming" | "open" | "closed";

/** What the current student may do with a test right now. */
export type StudentTestState =
  | "not_started" // no attempt yet
  | "in_progress" // attempt started, not submitted
  | "submitted" // attempt finalized
  | "missed"; // window closed without a submission

export type Option = { key: string; text: string };

/** A question as scored on the server (includes the correct key). */
export type ScorableQuestion = {
  id: string;
  correct_answer: string;
};

/** One saved answer: the option key the student picked for a question. */
export type Answer = { questionId: string; optionKey: string | null };

export type TestTiming = {
  opensAt: number; // epoch ms
  dueAt: number; // epoch ms — on-time deadline
  closesAt: number; // epoch ms — hard lock
};

/** Resolve the absolute window boundaries for a test. */
export function computeTiming(
  scheduledAt: string,
  durationMinutes: number
): TestTiming {
  const opensAt = new Date(scheduledAt).getTime();
  const dueAt = opensAt + durationMinutes * 60_000;
  const closesAt = dueAt + LATE_GRACE_MINUTES * 60_000;
  return { opensAt, dueAt, closesAt };
}

/**
 * Where the test sits relative to now and its status: `upcoming` before it opens,
 * `closed` only once the teacher has closed it (quiz status `closed`), otherwise
 * `open`. There is no time-based lock — an open test stays startable indefinitely
 * after `opensAt`. `status` is optional; omitting it treats the test as open-once-
 * scheduled (the correct default for the student-facing flows that have no closed
 * state to report).
 */
export function computePhase(
  t: TestTiming,
  now: number = Date.now(),
  status?: QuizStatus
): TestPhase {
  if (status === "closed") return "closed";
  if (now < t.opensAt) return "upcoming";
  return "open";
}

/**
 * The moment this student's attempt must be finished by: their own full duration
 * measured from when they started. A late start no longer eats into their time —
 * there is no hard lock to cap against (D21).
 */
export function personalDeadline(
  startedAt: string,
  durationMinutes: number
): number {
  return new Date(startedAt).getTime() + durationMinutes * 60_000;
}

/** A submission is late when it lands after the on-time deadline. */
export function isLateSubmission(submittedAtMs: number, t: TestTiming): boolean {
  return submittedAtMs > t.dueAt;
}

/**
 * The admin reporting outcome for one student on one test — the vocabulary used by
 * the late/missed report (F7) and the student detail history (F5). Derived from the
 * attempt record + the test's window phase; never trusted from the client.
 */
export type ResultOutcome =
  | "on_time" // submitted on or before the on-time deadline
  | "late" // submitted after the on-time deadline (is_late)
  | "in_progress" // started, test still open, not yet submitted
  | "expired" // started but the teacher closed the test without a submission
  | "missed" // never started and the teacher has closed the test
  | "pending"; // never started but the test is still open (can still take it)

export function deriveOutcome(
  attempt: { status: AttemptStatus; is_late: boolean | null } | null | undefined,
  phase: TestPhase
): ResultOutcome {
  if (!attempt) return phase === "closed" ? "missed" : "pending";
  if (attempt.status === "submitted") return attempt.is_late ? "late" : "on_time";
  if (attempt.status === "missed") return "missed";
  // in_progress
  return phase === "closed" ? "expired" : "in_progress";
}

export type ScoreResult = {
  score: number;
  maxScore: number;
  correctCount: number;
};

/**
 * Score an attempt from scratch. Correct answers are only ever read here, on the
 * server. Each correct answer earns `marksPerQuestion`; each *answered* wrong
 * answer costs `negativeMarking`; blanks are neutral. The total is floored at 0
 * so negative marking can never produce a negative score.
 */
export function scoreAttempt(
  questions: ScorableQuestion[],
  answers: Answer[],
  marksPerQuestion: number,
  negativeMarking: number
): ScoreResult {
  const picked = new Map<string, string | null>();
  for (const a of answers) picked.set(a.questionId, a.optionKey);

  let score = 0;
  let correctCount = 0;

  for (const q of questions) {
    const chosen = picked.get(q.id);
    if (chosen == null || chosen === "") continue; // unanswered → neutral
    if (chosen === q.correct_answer) {
      score += marksPerQuestion;
      correctCount += 1;
    } else {
      score -= negativeMarking;
    }
  }

  const maxScore = questions.length * marksPerQuestion;
  // Round to 2 dp to avoid float dust from fractional negative marking.
  score = Math.round(Math.max(0, score) * 100) / 100;
  return { score, maxScore, correctCount };
}

/**
 * Coerce whatever shape a question's `options` column holds into [{key,text}].
 * Legacy rows may store a bare string[]; new rows store [{key,text}]. Used by
 * the take payload so the student UI always gets a consistent shape.
 */
export function normalizeOptions(raw: unknown): Option[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((o, i) => {
    if (o && typeof o === "object" && "key" in o && "text" in o) {
      return { key: String((o as Option).key), text: String((o as Option).text) };
    }
    // Legacy string[] → synthesize A/B/C/D keys.
    return { key: String.fromCharCode(65 + i), text: String(o) };
  });
}
