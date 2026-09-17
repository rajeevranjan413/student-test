-- Study Material (F13 / DECISIONS D24): a teacher shares material with a batch and
-- every enrolled student can view/download it. Today the only material `kind` is
-- `notes` — a PDF with a title + description.
--
-- This migration is additive & idempotent (CREATE TABLE / ADD COLUMN / policies
-- dropped-then-created; bucket insert is ON CONFLICT DO NOTHING). It changes no
-- existing table. It reuses the RLS helpers from 20260915140000_enable_rls.sql
-- (`public.is_teacher()`, `public.is_enrolled(uuid)`).
--
-- File hosting: the PDF bytes live in a PRIVATE Supabase Storage bucket
-- (`study-material`); this table stores only metadata + the object path. All object
-- access is server-side via the service-role client (upload) and short-lived signed
-- URLs (download), so the bucket needs no browser-facing storage.objects policies.

-- ---------------------------------------------------------------------------
-- 1. Metadata table.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS study_materials (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id    uuid NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  teacher_id  uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  kind        text NOT NULL DEFAULT 'notes',   -- free text so future kinds are additive
  title       text NOT NULL,
  description text,
  file_path   text NOT NULL,                   -- object path inside the study-material bucket
  file_name   text NOT NULL,                   -- original filename (used on download)
  file_size   bigint,
  mime_type   text,
  archived_at timestamptz,                      -- reserved for a future soft-delete; NULL = live
  created_at  timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Older re-runs: make sure the reserved column exists even if the table pre-dated it.
ALTER TABLE study_materials ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS study_materials_batch_idx ON study_materials(batch_id);

-- ---------------------------------------------------------------------------
-- 2. RLS — mirror the API access model (teacher manages; student reads their own
--    enrolled, non-archived materials). Same helpers as the core-table policies.
-- ---------------------------------------------------------------------------
ALTER TABLE study_materials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS study_materials_select_teacher ON study_materials;
CREATE POLICY study_materials_select_teacher ON study_materials
  FOR SELECT TO authenticated
  USING (public.is_teacher());

DROP POLICY IF EXISTS study_materials_select_student ON study_materials;
CREATE POLICY study_materials_select_student ON study_materials
  FOR SELECT TO authenticated
  USING (public.is_enrolled(batch_id) AND archived_at IS NULL);

DROP POLICY IF EXISTS study_materials_insert_teacher ON study_materials;
CREATE POLICY study_materials_insert_teacher ON study_materials
  FOR INSERT TO authenticated
  WITH CHECK (public.is_teacher());

DROP POLICY IF EXISTS study_materials_update_teacher ON study_materials;
CREATE POLICY study_materials_update_teacher ON study_materials
  FOR UPDATE TO authenticated
  USING (public.is_teacher())
  WITH CHECK (public.is_teacher());

DROP POLICY IF EXISTS study_materials_delete_teacher ON study_materials;
CREATE POLICY study_materials_delete_teacher ON study_materials
  FOR DELETE TO authenticated
  USING (public.is_teacher());

-- ---------------------------------------------------------------------------
-- 3. Private storage bucket for the PDF bytes. Guarded so this SQL is harmless on
--    a bare Postgres that has no Supabase `storage` schema (e.g. local unit runs).
--    No object-level policies: all access is server-side via the service role.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.schemata WHERE schema_name = 'storage'
  ) THEN
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('study-material', 'study-material', false)
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;
