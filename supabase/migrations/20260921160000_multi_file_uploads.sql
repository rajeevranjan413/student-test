-- Multiple files per Study-Material note (F13) and per file-Homework (F14), plus a
-- larger upload ceiling (100 MB — see utils/studyMaterial.ts). DECISIONS D28.
--
-- Until now a note / a `file` homework held exactly ONE file, stored inline on the
-- parent row (`file_path`, `file_name`, `file_size`, `mime_type`, `storage_provider`).
-- The maintainer wants a teacher to attach SEVERAL PDFs/images to one note or one
-- homework. This migration introduces a child "files" table per feature so a parent
-- can own many files, and BACKFILLS every existing single-file parent into its child
-- table so all reads become uniform (one code path, many files).
--
-- Additive & idempotent: two NEW tables + policies (dropped-then-created) + a guarded
-- backfill (NOT EXISTS). No existing column is renamed or dropped — the parent file
-- columns are KEPT (legacy/first-file mirror) but their NOT NULL is relaxed on
-- study_materials so a note may exist with its files only in the child table. Reuses
-- the RLS helpers from 20260915140000_enable_rls.sql (`public.is_teacher()`,
-- `public.is_enrolled(uuid)`).

-- ---------------------------------------------------------------------------
-- 1. study_material_files — many files under one study_materials note.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS study_material_files (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id      uuid NOT NULL REFERENCES study_materials(id) ON DELETE CASCADE,
  storage_provider text NOT NULL DEFAULT 'supabase',   -- 'supabase' | 'cloudinary' (D27)
  file_path        text NOT NULL,                       -- provider-relative path / public_id
  file_name        text NOT NULL,                       -- original filename (used on download)
  file_size        bigint,
  mime_type        text,
  "order"          int NOT NULL DEFAULT 0,              -- display order within the note
  created_at       timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS study_material_files_material_idx
  ON study_material_files(material_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'study_material_files_storage_provider_chk'
  ) THEN
    ALTER TABLE study_material_files
      ADD CONSTRAINT study_material_files_storage_provider_chk
      CHECK (storage_provider IN ('supabase', 'cloudinary'));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. homework_files — many files under one `file`-kind homework.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS homework_files (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  homework_id      uuid NOT NULL REFERENCES homework(id) ON DELETE CASCADE,
  storage_provider text NOT NULL DEFAULT 'supabase',
  file_path        text NOT NULL,
  file_name        text NOT NULL,
  file_size        bigint,
  mime_type        text,
  "order"          int NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS homework_files_homework_idx
  ON homework_files(homework_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'homework_files_storage_provider_chk'
  ) THEN
    ALTER TABLE homework_files
      ADD CONSTRAINT homework_files_storage_provider_chk
      CHECK (storage_provider IN ('supabase', 'cloudinary'));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Relax NOT NULL on the parent file columns (study_materials). A multi-file
--    note keeps its files in the child table only, so these become optional.
--    Idempotent — DROP NOT NULL on an already-nullable column is a no-op. The
--    columns are NOT dropped (D27 storage layer + old rows still reference them).
-- ---------------------------------------------------------------------------
ALTER TABLE study_materials ALTER COLUMN file_path DROP NOT NULL;
ALTER TABLE study_materials ALTER COLUMN file_name DROP NOT NULL;
-- homework's file columns were already nullable ('mcq' rows have no file).

-- ---------------------------------------------------------------------------
-- 4. RLS — mirror the parent access model. Teachers manage; students may SELECT a
--    file only when its parent is one they are allowed to see (enrolled + live +,
--    for homework, published). Downloads still go through the service role + signed
--    URLs; these policies are defense-in-depth + let the list APIs read files.
-- ---------------------------------------------------------------------------
ALTER TABLE study_material_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS study_material_files_select_teacher ON study_material_files;
CREATE POLICY study_material_files_select_teacher ON study_material_files
  FOR SELECT TO authenticated
  USING (public.is_teacher());

DROP POLICY IF EXISTS study_material_files_select_student ON study_material_files;
CREATE POLICY study_material_files_select_student ON study_material_files
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM study_materials m
      WHERE m.id = study_material_files.material_id
        AND public.is_enrolled(m.batch_id)
        AND m.archived_at IS NULL
    )
  );

DROP POLICY IF EXISTS study_material_files_insert_teacher ON study_material_files;
CREATE POLICY study_material_files_insert_teacher ON study_material_files
  FOR INSERT TO authenticated
  WITH CHECK (public.is_teacher());

DROP POLICY IF EXISTS study_material_files_update_teacher ON study_material_files;
CREATE POLICY study_material_files_update_teacher ON study_material_files
  FOR UPDATE TO authenticated
  USING (public.is_teacher())
  WITH CHECK (public.is_teacher());

DROP POLICY IF EXISTS study_material_files_delete_teacher ON study_material_files;
CREATE POLICY study_material_files_delete_teacher ON study_material_files
  FOR DELETE TO authenticated
  USING (public.is_teacher());

ALTER TABLE homework_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS homework_files_select_teacher ON homework_files;
CREATE POLICY homework_files_select_teacher ON homework_files
  FOR SELECT TO authenticated
  USING (public.is_teacher());

DROP POLICY IF EXISTS homework_files_select_student ON homework_files;
CREATE POLICY homework_files_select_student ON homework_files
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM homework h
      WHERE h.id = homework_files.homework_id
        AND public.is_enrolled(h.batch_id)
        AND h.archived_at IS NULL
        AND (h.is_published OR h.status <> 'draft')
    )
  );

DROP POLICY IF EXISTS homework_files_insert_teacher ON homework_files;
CREATE POLICY homework_files_insert_teacher ON homework_files
  FOR INSERT TO authenticated
  WITH CHECK (public.is_teacher());

DROP POLICY IF EXISTS homework_files_update_teacher ON homework_files;
CREATE POLICY homework_files_update_teacher ON homework_files
  FOR UPDATE TO authenticated
  USING (public.is_teacher())
  WITH CHECK (public.is_teacher());

DROP POLICY IF EXISTS homework_files_delete_teacher ON homework_files;
CREATE POLICY homework_files_delete_teacher ON homework_files
  FOR DELETE TO authenticated
  USING (public.is_teacher());

-- ---------------------------------------------------------------------------
-- 5. Backfill — copy each existing single-file parent into its child table so all
--    reads use the child table uniformly. Guarded by NOT EXISTS, so re-runs (and
--    parents that already have child files) are safe no-ops.
-- ---------------------------------------------------------------------------
INSERT INTO study_material_files
  (material_id, storage_provider, file_path, file_name, file_size, mime_type, "order")
SELECT m.id, m.storage_provider, m.file_path,
       COALESCE(m.file_name, 'file'), m.file_size, m.mime_type, 0
FROM study_materials m
WHERE m.file_path IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM study_material_files f WHERE f.material_id = m.id
  );

INSERT INTO homework_files
  (homework_id, storage_provider, file_path, file_name, file_size, mime_type, "order")
SELECT h.id, h.storage_provider, h.file_path,
       COALESCE(h.file_name, 'file'), h.file_size, h.mime_type, 0
FROM homework h
WHERE h.type = 'file' AND h.file_path IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM homework_files f WHERE f.homework_id = h.id
  );
