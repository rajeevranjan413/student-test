-- Row-Level Security (RLS) + answer confidentiality.
--
-- Until now access control lived only in the API layer. Because every user-scoped
-- Route Handler uses the SAME anon key + user JWT as the browser, a signed-in
-- student could hit Supabase (PostgREST) directly and read data the API is
-- careful to withhold — most importantly `questions.correct_answer` — and could
-- even write their own `quiz_attempts` (e.g. a forged score). This migration
-- backs the API with defense-in-depth:
--
--   1. RLS is enabled on every core table; policies mirror the API access model
--      (teachers manage their data; students read only their enrolled, published
--      tests and their own attempts).
--   2. `questions.correct_answer` (and `explanation`, which gives the answer away)
--      are column-REVOKEd from `anon`/`authenticated`, so NO browser/user session
--      can ever select them — even with a hand-crafted query. The server reads
--      them through the service-role client (see utils/supabase/admin.ts), which
--      bypasses RLS and column grants.
--   3. `quiz_attempts` has NO insert/update/delete policy for the browser JWT, so
--      attempts can only be written by the server (service role). This makes
--      client-side score tampering impossible while leaving read (own rows) open.
--
-- Safe to re-run: helpers use CREATE OR REPLACE, ENABLE RLS is idempotent, and
-- every policy is dropped-then-created. GRANT/REVOKE are idempotent.

-- ---------------------------------------------------------------------------
-- Helper functions. SECURITY DEFINER so they read profiles / student_batches
-- WITHOUT triggering those tables' own RLS (which would recurse). Owned by the
-- migration role (table owner), so they bypass RLS as intended.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_teacher()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'teacher'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_enrolled(p_batch_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM student_batches
    WHERE student_id = auth.uid() AND batch_id = p_batch_id
  );
$$;

REVOKE ALL ON FUNCTION public.is_teacher() FROM public;
REVOKE ALL ON FUNCTION public.is_enrolled(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.is_teacher() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_enrolled(uuid) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- profiles — a user reads their own row; a teacher reads all (names/roster).
-- Writes happen via service role (register/login bootstrap).
-- ---------------------------------------------------------------------------
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_select ON profiles;
CREATE POLICY profiles_select ON profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_teacher());

-- ---------------------------------------------------------------------------
-- batches — teacher-managed. Enrolled students may read their batch rows (the
-- student take/dashboard queries embed `batches(name)`). `secret_pass` cannot be
-- column-hidden from students alone because teachers share the `authenticated`
-- role; the API never returns it to students and anon has no batch access at all.
-- ---------------------------------------------------------------------------
ALTER TABLE batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS batches_select_teacher ON batches;
CREATE POLICY batches_select_teacher ON batches
  FOR SELECT TO authenticated
  USING (public.is_teacher());

DROP POLICY IF EXISTS batches_select_enrolled ON batches;
CREATE POLICY batches_select_enrolled ON batches
  FOR SELECT TO authenticated
  USING (public.is_enrolled(id));

DROP POLICY IF EXISTS batches_insert_teacher ON batches;
CREATE POLICY batches_insert_teacher ON batches
  FOR INSERT TO authenticated
  WITH CHECK (public.is_teacher());

DROP POLICY IF EXISTS batches_update_teacher ON batches;
CREATE POLICY batches_update_teacher ON batches
  FOR UPDATE TO authenticated
  USING (public.is_teacher())
  WITH CHECK (public.is_teacher());

DROP POLICY IF EXISTS batches_delete_teacher ON batches;
CREATE POLICY batches_delete_teacher ON batches
  FOR DELETE TO authenticated
  USING (public.is_teacher());

-- Keep `secret_pass` out of any public (anon) reach as belt-and-suspenders.
REVOKE SELECT (secret_pass) ON batches FROM anon;

-- ---------------------------------------------------------------------------
-- student_batches — a student reads their own enrollments; a teacher reads all.
-- Enrollment writes happen via service role (register / future enroll UI).
-- ---------------------------------------------------------------------------
ALTER TABLE student_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS student_batches_select ON student_batches;
CREATE POLICY student_batches_select ON student_batches
  FOR SELECT TO authenticated
  USING (student_id = auth.uid() OR public.is_teacher());

-- ---------------------------------------------------------------------------
-- quizzes — teachers manage; students read only published tests in a batch they
-- are enrolled in (drafts stay invisible).
-- ---------------------------------------------------------------------------
ALTER TABLE quizzes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quizzes_select_teacher ON quizzes;
CREATE POLICY quizzes_select_teacher ON quizzes
  FOR SELECT TO authenticated
  USING (public.is_teacher());

DROP POLICY IF EXISTS quizzes_select_student ON quizzes;
CREATE POLICY quizzes_select_student ON quizzes
  FOR SELECT TO authenticated
  USING (
    batch_id IS NOT NULL
    AND public.is_enrolled(batch_id)
    AND (is_published OR status <> 'draft')
  );

DROP POLICY IF EXISTS quizzes_insert_teacher ON quizzes;
CREATE POLICY quizzes_insert_teacher ON quizzes
  FOR INSERT TO authenticated
  WITH CHECK (public.is_teacher());

DROP POLICY IF EXISTS quizzes_update_teacher ON quizzes;
CREATE POLICY quizzes_update_teacher ON quizzes
  FOR UPDATE TO authenticated
  USING (public.is_teacher())
  WITH CHECK (public.is_teacher());

DROP POLICY IF EXISTS quizzes_delete_teacher ON quizzes;
CREATE POLICY quizzes_delete_teacher ON quizzes
  FOR DELETE TO authenticated
  USING (public.is_teacher());

-- ---------------------------------------------------------------------------
-- questions — teachers manage; students may read the question BODY of a test
-- they can take (so the take payload + question counts work), but never the
-- answer columns. `correct_answer`/`explanation` are column-REVOKEd below so the
-- browser JWT physically cannot select them; the server uses the service-role
-- client for scoring and post-submit review.
-- ---------------------------------------------------------------------------
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS questions_select_teacher ON questions;
CREATE POLICY questions_select_teacher ON questions
  FOR SELECT TO authenticated
  USING (public.is_teacher());

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
    )
  );

DROP POLICY IF EXISTS questions_insert_teacher ON questions;
CREATE POLICY questions_insert_teacher ON questions
  FOR INSERT TO authenticated
  WITH CHECK (public.is_teacher());

DROP POLICY IF EXISTS questions_update_teacher ON questions;
CREATE POLICY questions_update_teacher ON questions
  FOR UPDATE TO authenticated
  USING (public.is_teacher())
  WITH CHECK (public.is_teacher());

DROP POLICY IF EXISTS questions_delete_teacher ON questions;
CREATE POLICY questions_delete_teacher ON questions
  FOR DELETE TO authenticated
  USING (public.is_teacher());

-- Answer confidentiality: no browser/user session may SELECT these columns.
-- (INSERT of them by teachers still works — INSERT is a separate privilege.)
-- The server reads them via the service-role client, which is unaffected.
REVOKE SELECT (correct_answer) ON questions FROM anon, authenticated;
REVOKE SELECT (explanation)    ON questions FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- quiz_attempts — a student reads ONLY their own rows; a teacher reads all (for
-- results/leaderboard). There is intentionally NO insert/update/delete policy
-- for the browser JWT: every attempt write goes through the service-role client
-- server-side, so scores/status cannot be forged from the client.
-- ---------------------------------------------------------------------------
ALTER TABLE quiz_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quiz_attempts_select_student ON quiz_attempts;
CREATE POLICY quiz_attempts_select_student ON quiz_attempts
  FOR SELECT TO authenticated
  USING (student_id = auth.uid());

DROP POLICY IF EXISTS quiz_attempts_select_teacher ON quiz_attempts;
CREATE POLICY quiz_attempts_select_teacher ON quiz_attempts
  FOR SELECT TO authenticated
  USING (public.is_teacher());
