-- Soft-delete (archive) support for tests (quizzes). See DECISIONS D22 / FEATURES F3.
--
-- A test with no attempts is hard-deleted by the API (its questions cascade). A test
-- that already has quiz_attempts is soft-deleted instead — `archived_at` is set so
-- results (F7) and the leaderboard (F8) keep working — and must then disappear from
-- students. We use a nullable timestamp column (mirroring batches.archived_at) rather
-- than a new `quiz_status` value, because the student SELECT policy allows any status
-- other than 'draft', so an 'archived' status would still leak to students.
--
-- Safe to re-run: ADD COLUMN IF NOT EXISTS is idempotent; policies are dropped then
-- recreated. No column is renamed or dropped.

-- 1. The soft-delete marker. NULL = live test.
ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- 2. Re-scope the student read policies to hide archived tests. These mirror the
--    original definitions in 20260915140000_enable_rls.sql, plus `archived_at IS NULL`.
DROP POLICY IF EXISTS quizzes_select_student ON quizzes;
CREATE POLICY quizzes_select_student ON quizzes
  FOR SELECT TO authenticated
  USING (
    batch_id IS NOT NULL
    AND public.is_enrolled(batch_id)
    AND (is_published OR status <> 'draft')
    AND archived_at IS NULL
  );

DROP POLICY IF EXISTS questions_select_student ON questions;
CREATE POLICY questions_select_student ON questions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM quizzes q
      WHERE q.id = questions.quiz_id
        AND q.batch_id IS NOT NULL
        AND public.is_enrolled(q.batch_id)
        AND (q.is_published OR q.status <> 'draft')
        AND q.archived_at IS NULL
    )
  );
