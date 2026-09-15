-- Additive, backward-compatible extension for scheduled AI tests, the student
-- attempt lifecycle (window / single-attempt / late / missed), richer questions,
-- and batch archiving. Safe to re-run: all changes guard with IF NOT EXISTS or
-- DO-blocks so re-application does not error.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE quiz_status AS ENUM ('draft', 'published', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE attempt_status AS ENUM ('in_progress', 'submitted', 'missed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE batch_status AS ENUM ('active', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- batches: soft-delete / archive support
-- ---------------------------------------------------------------------------
ALTER TABLE batches
  ADD COLUMN IF NOT EXISTS status batch_status NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS exam_level TEXT,
  ADD COLUMN IF NOT EXISTS start_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- quizzes (a.k.a. Test): scheduling, marks scheme, exam level, lifecycle status
-- ---------------------------------------------------------------------------
ALTER TABLE quizzes
  ADD COLUMN IF NOT EXISTS exam_level TEXT,
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS duration_minutes INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS total_questions INTEGER,
  ADD COLUMN IF NOT EXISTS marks_per_question INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS negative_marking NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS passing_marks INTEGER,
  ADD COLUMN IF NOT EXISTS status quiz_status NOT NULL DEFAULT 'draft';

-- Keep the legacy is_published flag consistent with the new status column.
UPDATE quizzes SET status = 'published' WHERE is_published = true AND status = 'draft';

-- ---------------------------------------------------------------------------
-- questions: explanation / difficulty / ordering / provenance
-- options (jsonb) now holds [{ "key": "A", "text": "..." }, ...]
-- correct_answer holds the correct option key (e.g. "B")
-- ---------------------------------------------------------------------------
ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS explanation TEXT,
  ADD COLUMN IF NOT EXISTS difficulty TEXT,
  ADD COLUMN IF NOT EXISTS "order" INTEGER,
  ADD COLUMN IF NOT EXISTS source_image_ref TEXT;

-- ---------------------------------------------------------------------------
-- quiz_attempts: full attempt lifecycle + one-attempt-per-student enforcement
-- ---------------------------------------------------------------------------
ALTER TABLE quiz_attempts
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_late BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS status attempt_status NOT NULL DEFAULT 'submitted',
  ADD COLUMN IF NOT EXISTS correct_count INTEGER,
  ADD COLUMN IF NOT EXISTS answers JSONB NOT NULL DEFAULT '[]'::jsonb;

-- score/max_score already exist; make score nullable-safe for in_progress rows.
ALTER TABLE quiz_attempts ALTER COLUMN score DROP NOT NULL;
ALTER TABLE quiz_attempts ALTER COLUMN max_score DROP NOT NULL;

-- Exactly one attempt per (quiz, student) — the server-side single-attempt guard.
DO $$ BEGIN
  ALTER TABLE quiz_attempts
    ADD CONSTRAINT quiz_attempts_quiz_student_unique UNIQUE (quiz_id, student_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_quiz_attempts_student ON quiz_attempts (student_id);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_quiz ON quiz_attempts (quiz_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_batch ON quizzes (batch_id);
CREATE INDEX IF NOT EXISTS idx_questions_quiz ON questions (quiz_id);
