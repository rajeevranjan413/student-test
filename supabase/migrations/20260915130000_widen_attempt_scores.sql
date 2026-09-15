-- Additive, backward-compatible: widen attempt score columns to NUMERIC so that
-- fractional negative marking (e.g. -0.25 per wrong answer) is stored exactly
-- instead of being truncated by INTEGER. Widening INTEGER -> NUMERIC is safe:
-- existing integer values remain valid and re-running the ALTER is a no-op.
ALTER TABLE quiz_attempts
  ALTER COLUMN score TYPE NUMERIC USING score::numeric,
  ALTER COLUMN max_score TYPE NUMERIC USING max_score::numeric;
