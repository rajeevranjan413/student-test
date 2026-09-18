-- Study Material → subject-organized (F13 / DECISIONS D25). A teacher adds
-- SUBJECTS to a batch, then files notes (a PDF or an image) under a subject.
-- Students see a batch's subjects as folders and open a folder to view its notes.
--
-- Additive & idempotent: new `subjects` table + a NULLABLE `study_materials.subject_id`;
-- no existing column is renamed or dropped, and it reuses the private `study-material`
-- bucket + the RLS helpers (`public.is_teacher()`, `public.is_enrolled(uuid)`) from
-- earlier migrations. Policies are dropped-then-created so re-runs are safe.

-- ---------------------------------------------------------------------------
-- 1. subjects — a named folder owned by a teacher, scoped to one batch.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subjects (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id    uuid NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  teacher_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name        text NOT NULL,
  archived_at timestamptz,                      -- reserved for a future soft-delete; NULL = live
  created_at  timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS subjects_batch_idx ON subjects(batch_id);

-- ---------------------------------------------------------------------------
-- 2. study_materials.subject_id — file a note under a subject. NULLABLE so this
--    is additive (legacy pre-subject rows keep NULL and show in no folder). The
--    denormalized `batch_id` stays and keeps enrollment-based RLS unchanged.
-- ---------------------------------------------------------------------------
ALTER TABLE study_materials
  ADD COLUMN IF NOT EXISTS subject_id uuid REFERENCES subjects(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS study_materials_subject_idx ON study_materials(subject_id);

-- ---------------------------------------------------------------------------
-- 3. RLS — mirror the study_materials model: teacher manages; a student reads
--    their own enrolled, non-archived subjects. Same helpers as the core tables.
-- ---------------------------------------------------------------------------
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS subjects_select_teacher ON subjects;
CREATE POLICY subjects_select_teacher ON subjects
  FOR SELECT TO authenticated
  USING (public.is_teacher());

DROP POLICY IF EXISTS subjects_select_student ON subjects;
CREATE POLICY subjects_select_student ON subjects
  FOR SELECT TO authenticated
  USING (public.is_enrolled(batch_id) AND archived_at IS NULL);

DROP POLICY IF EXISTS subjects_insert_teacher ON subjects;
CREATE POLICY subjects_insert_teacher ON subjects
  FOR INSERT TO authenticated
  WITH CHECK (public.is_teacher());

DROP POLICY IF EXISTS subjects_update_teacher ON subjects;
CREATE POLICY subjects_update_teacher ON subjects
  FOR UPDATE TO authenticated
  USING (public.is_teacher())
  WITH CHECK (public.is_teacher());

DROP POLICY IF EXISTS subjects_delete_teacher ON subjects;
CREATE POLICY subjects_delete_teacher ON subjects
  FOR DELETE TO authenticated
  USING (public.is_teacher());
