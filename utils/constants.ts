// Shared constants.

// Informational grace period (in minutes) after a test's scheduled end
// (scheduled_at + duration_minutes). Since D21 this NO LONGER gates anything:
// tests stay startable until the teacher closes them, and a late submission is
// flagged `is_late` (submitted after the scheduled end) regardless of grace. It
// survives only as the reporting `closesAt = due + grace` marker in
// utils/test.ts#computeTiming. Non-submitters count as `missed` only once the
// teacher closes the test.
export const LATE_GRACE_MINUTES = 15;

export const DIFFICULTY_COLORS: Record<string, string> = {
  easy: "green",
  medium: "gold",
  hard: "red",
};
