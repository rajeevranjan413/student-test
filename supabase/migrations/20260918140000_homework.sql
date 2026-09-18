-- Homework (F14 / DECISIONS D26): a teacher creates homework for a batch. Two kinds:
--   * `mcq`  — a set of multiple-choice questions the student ATTEMPTS & submits
--              (graded server-side, exactly like a Test but with no countdown timer).
--   * `file` — a PDF or image the teacher uploads; the student reads it and simply
--              MARKS IT DONE (no upload back).
--
-- Additive & idempotent: three NEW tables (`homework`, `homework_questions`,
-- `homework_attempts`) + a NEW private storage bucket (`homework`). It changes no
-- existing table and reuses the RLS helpers from 20260915140000_enable_rls.sql
-- (`public.is_teacher()`, `public.is_enrolled(uuid)`). Every policy is
-- dropped-then-created and GRANT/REVOKE are idempotent, so re-runs are safe.
--
-- Answer confidentiality mirrors `questions` (F10): `homework_questions.correct_answer`
-- and `explanation` are column-REVOKEd from anon/authenticated, so the browser JWT
-- can never read them — the server scores through the service-role client. And
-- `homework_attempts` has NO browser write policy, so scores/completions can only be
-- written server-side (service role).

-- ---------------------------------------------------------------------------
-- 1. homework — one assignment for a batch. `type` picks the shape.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS homework (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id           uuid NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  teacher_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type               text NOT NULL DEFAULT 'mcq' CHECK (type IN ('mcq', 'file')),
  title              text NOT NULL,
  description        text,
  due_at             timestamptz,                       -- optional deadline (informational)
  -- MCQ fields (NULL for `file` homework)
  total_questions    int,                               -- target set at creation
  marks_per_question int  NOT NULL DEFAULT 1,
  negative_marking   numeric NOT NULL DEFAULT 0,
  -- FILE fields (NULL for `mcq` homework) — object lives in the private `homework` bucket
  file_path          text,
  file_name          text,
  file_size          bigint,
  mime_type          text,
  status             text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  is_published       boolean NOT NULL DEFAULT false,    -- mirrored from status
  archived_at        timestamptz,                        -- soft-delete once it has attempts; NULL = live
  created_at         timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS homework_batch_idx ON homework(batch_id);
CREATE INDEX IF NOT EXISTS homework_teacher_idx ON homework(teacher_id);

-- ---------------------------------------------------------------------------
-- 2. homework_questions — the MCQ body (mirrors `questions`). Only present for
--    `type='mcq'` homework. Answer columns are column-REVOKEd below.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS homework_questions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  homework_id    uuid NOT NULL REFERENCES homework(id) ON DELETE CASCADE,
  question_text  text NOT NULL,
  options        jsonb NOT NULL DEFAULT '[]'::jsonb,     -- [{ "key":"A", "text":"..." }]
  correct_answer text,                                    -- the correct option key (e.g. "B")
  explanation    text,
  difficulty     text,
  "order"        int,
  created_at     timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS homework_questions_homework_idx ON homework_questions(homework_id);

-- ---------------------------------------------------------------------------
-- 3. homework_attempts — one row per student per homework (single attempt). Serves
--    both kinds: `submitted` (graded MCQ) and `done` (a file marked complete).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS homework_attempts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  homework_id   uuid NOT NULL REFERENCES homework(id) ON DELETE CASCADE,
  student_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status        text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'done')),
  score         numeric,                                 -- MCQ only (NULL for file)
  max_score     numeric,
  correct_count int,
  answers       jsonb NOT NULL DEFAULT '[]'::jsonb,      -- [{ "questionId":"…", "optionKey":"A" }]
  submitted_at  timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  created_at    timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (homework_id, student_id)                       -- DB-level single-attempt guarantee
);

CREATE INDEX IF NOT EXISTS homework_attempts_homework_idx ON homework_attempts(homework_id);
CREATE INDEX IF NOT EXISTS homework_attempts_student_idx ON homework_attempts(student_id);

-- ---------------------------------------------------------------------------
-- 4. RLS — mirror the API access model (teacher manages; students read published,
--    non-archived homework in their enrolled batches + their own attempts).
-- ---------------------------------------------------------------------------
ALTER TABLE homework ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS homework_select_teacher ON homework;
CREATE POLICY homework_select_teacher ON homework
  FOR SELECT TO authenticated
  USING (public.is_teacher());

DROP POLICY IF EXISTS homework_select_student ON homework;
CREATE POLICY homework_select_student ON homework
  FOR SELECT TO authenticated
  USING (
    public.is_enrolled(batch_id)
    AND archived_at IS NULL
    AND (is_published OR status <> 'draft')
  );

DROP POLICY IF EXISTS homework_insert_teacher ON homework;
CREATE POLICY homework_insert_teacher ON homework
  FOR INSERT TO authenticated
  WITH CHECK (public.is_teacher());

DROP POLICY IF EXISTS homework_update_teacher ON homework;
CREATE POLICY homework_update_teacher ON homework
  FOR UPDATE TO authenticated
  USING (public.is_teacher())
  WITH CHECK (public.is_teacher());

DROP POLICY IF EXISTS homework_delete_teacher ON homework;
CREATE POLICY homework_delete_teacher ON homework
  FOR DELETE TO authenticated
  USING (public.is_teacher());

-- homework_questions — teachers manage; students read the BODY (no answers) of a
-- published, non-archived homework they are enrolled in.
ALTER TABLE homework_questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS homework_questions_select_teacher ON homework_questions;
CREATE POLICY homework_questions_select_teacher ON homework_questions
  FOR SELECT TO authenticated
  USING (public.is_teacher());

DROP POLICY IF EXISTS homework_questions_select_student ON homework_questions;
CREATE POLICY homework_questions_select_student ON homework_questions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM homework h
      WHERE h.id = homework_questions.homework_id
        AND public.is_enrolled(h.batch_id)
        AND h.archived_at IS NULL
        AND (h.is_published OR h.status <> 'draft')
    )
  );

DROP POLICY IF EXISTS homework_questions_insert_teacher ON homework_questions;
CREATE POLICY homework_questions_insert_teacher ON homework_questions
  FOR INSERT TO authenticated
  WITH CHECK (public.is_teacher());

DROP POLICY IF EXISTS homework_questions_update_teacher ON homework_questions;
CREATE POLICY homework_questions_update_teacher ON homework_questions
  FOR UPDATE TO authenticated
  USING (public.is_teacher())
  WITH CHECK (public.is_teacher());

DROP POLICY IF EXISTS homework_questions_delete_teacher ON homework_questions;
CREATE POLICY homework_questions_delete_teacher ON homework_questions
  FOR DELETE TO authenticated
  USING (public.is_teacher());

-- Answer confidentiality: no browser/user session may SELECT these columns (F10).
REVOKE SELECT (correct_answer) ON homework_questions FROM anon, authenticated;
REVOKE SELECT (explanation)    ON homework_questions FROM anon, authenticated;

-- homework_attempts — a student reads ONLY their own rows; a teacher reads all.
-- No browser write policy: all writes go through the service-role client server-side.
ALTER TABLE homework_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS homework_attempts_select_student ON homework_attempts;
CREATE POLICY homework_attempts_select_student ON homework_attempts
  FOR SELECT TO authenticated
  USING (student_id = auth.uid());

DROP POLICY IF EXISTS homework_attempts_select_teacher ON homework_attempts;
CREATE POLICY homework_attempts_select_teacher ON homework_attempts
  FOR SELECT TO authenticated
  USING (public.is_teacher());

-- ---------------------------------------------------------------------------
-- 5. Private storage bucket for `file` homework bytes. Guarded so this SQL is
--    harmless on a bare Postgres with no Supabase `storage` schema. No object-level
--    policies: all access is server-side via the service role (signed URLs).
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.schemata WHERE schema_name = 'storage'
  ) THEN
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('homework', 'homework', false)
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;
