-- "What's new" tracking for students (FEATURES F16 / DECISIONS D32).
--
-- Students should be able to tell when a teacher has ADDED or CHANGED something in
-- their batches (a test, a homework, a study-material note). "Added" is already
-- detectable from `created_at`; "changed" needs a timestamp that moves on every
-- UPDATE. This migration gives `quizzes`, `homework`, and `study_materials` an
-- `updated_at` column kept current by a trigger, so the student APIs can emit a
-- per-item activity signature = greatest(created_at, updated_at). The client marks
-- items seen (localStorage) and badges the unseen — no server-side per-student read
-- state, so this stays additive and cheap.
--
-- Safe to re-run: ADD COLUMN IF NOT EXISTS is idempotent; the function is CREATE OR
-- REPLACE; triggers are dropped-then-created. No column is renamed or dropped, and no
-- grant changes (authenticated already SELECTs these tables; the new column inherits
-- the table-level grant, and it carries no secret).

-- 1. The activity timestamp. Defaults to now(); backfilled to created_at for existing
--    rows so nothing looks "updated" retroactively.
ALTER TABLE quizzes          ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE homework         ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE study_materials  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE quizzes         SET updated_at = created_at WHERE updated_at IS DISTINCT FROM created_at AND created_at IS NOT NULL;
UPDATE homework        SET updated_at = created_at WHERE updated_at IS DISTINCT FROM created_at AND created_at IS NOT NULL;
UPDATE study_materials SET updated_at = created_at WHERE updated_at IS DISTINCT FROM created_at AND created_at IS NOT NULL;

-- 2. Shared trigger function: stamp updated_at on every UPDATE.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 3. BEFORE UPDATE triggers (drop-then-create so re-runs are clean).
DROP TRIGGER IF EXISTS set_updated_at_quizzes ON quizzes;
CREATE TRIGGER set_updated_at_quizzes
  BEFORE UPDATE ON quizzes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_homework ON homework;
CREATE TRIGGER set_updated_at_homework
  BEFORE UPDATE ON homework
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_study_materials ON study_materials;
CREATE TRIGGER set_updated_at_study_materials
  BEFORE UPDATE ON study_materials
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
