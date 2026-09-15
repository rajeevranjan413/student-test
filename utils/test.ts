// Server-authoritative timing + scoring for the student take-test flow.
//
// These are PURE functions (no Next/Supabase imports) so the same rules run on
// the server (enforcement of record) and on the client (countdown display only).
// The client is never trusted: the window lock, single-attempt guard, late flag
// and score are all recomputed server-side in the API routes.
//
// Timing model (see DECISIONS.md D10):
//   opensAt  = scheduled_at
//   dueAt    = scheduled_at + duration_minutes        (the on-time deadline)
//   closesAt = dueAt        + LATE_GRACE_MINUTES       (hard lock)
// A student may START only while now ∈ [opensAt, closesAt). Their personal
// deadline is min(started_at + duration, closesAt). A submission is `is_late`
// when it lands after dueAt. If the window closes with no submission the attempt
// is `missed`.

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

/** Where the test sits relative to now: before / during / after its window. */
export function computePhase(t: TestTiming, now: number = Date.now()): TestPhase {
  if (now < t.opensAt) return "upcoming";
  if (now >= t.closesAt) return "closed";
  return "open";
}

/**
 * The moment this student's attempt must be finished by: their own duration
 * measured from when they started, never past the hard lock.
 */
export function personalDeadline(
  startedAt: string,
  durationMinutes: number,
  t: TestTiming
): number {
  const personal = new Date(startedAt).getTime() + durationMinutes * 60_000;
  return Math.min(personal, t.closesAt);
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
  | "late" // submitted within the grace window (is_late)
  | "in_progress" // started, window still open, not yet submitted
  | "expired" // started but the window closed without a submission
  | "missed" // never started and the window has closed
  | "pending"; // never started but the window has not closed yet

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
