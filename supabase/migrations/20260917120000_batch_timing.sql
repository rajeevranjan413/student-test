-- Batch "class timing": replace the free-text `course` with structured start/end
-- times-of-day. Additive & idempotent (AGENTS.md §2) — safe to re-run:
--   * new columns guard with IF NOT EXISTS
--   * `course` is NOT dropped (a destructive change other code has read); it is only
--     made nullable so new inserts no longer have to supply it. It is left in place,
--     unused, for back-compat with existing rows. See DECISIONS.md D20.

-- ---------------------------------------------------------------------------
-- batches: add class timing (time-of-day)
-- ---------------------------------------------------------------------------
ALTER TABLE batches
  ADD COLUMN IF NOT EXISTS start_time TIME,
  ADD COLUMN IF NOT EXISTS end_time TIME;

-- Stop requiring the deprecated free-text course on insert (idempotent).
ALTER TABLE batches ALTER COLUMN course DROP NOT NULL;
