// Shared constants. Edit EXAM_LEVELS to match your coaching center's exams.
// Used by the batch and test (quiz) creation forms.

export const EXAM_LEVELS = [
  "JEE Main",
  "JEE Advanced",
  "NEET",
  "UPSC",
  "SSC",
  "Bank PO",
  "Foundation",
  "Class 10 Board",
  "Class 12 Board",
] as const;

export type ExamLevel = (typeof EXAM_LEVELS)[number];

// Grace period (in minutes) after a test's scheduled end (scheduled_at +
// duration_minutes) during which a student may still start/finish, but any
// submission made after the scheduled end is flagged `is_late`. After the grace
// window the test is hard-locked and non-submitters are counted as `missed`.
// Used by the student take-test timing model (see utils/test.ts).
export const LATE_GRACE_MINUTES = 15;

export const DIFFICULTY_COLORS: Record<string, string> = {
  easy: "green",
  medium: "gold",
  hard: "red",
};
