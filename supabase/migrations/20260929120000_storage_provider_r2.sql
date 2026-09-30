-- Cloudflare R2 becomes the sole file-storage backend (DECISIONS D34, supersedes D27's
-- Supabase-Storage + Cloudinary provider set). File bytes now live in a private R2 bucket
-- reached via short-lived presigned URLs (see `utils/storage.ts`).
--
-- Additive & idempotent: this migration only widens the `storage_provider` CHECK
-- constraints to also accept 'r2' and flips the column DEFAULT to 'r2' so NEW rows record
-- the R2 backend. It renames/drops NO column and keeps 'supabase'/'cloudinary' as valid
-- values so any legacy row stays constraint-valid. Re-runs are safe.
--
-- `file_path` for an r2 row is the self-contained R2 object key, e.g.
-- `study-material/<batch>/<subject>/<uuid>.pdf` (the logical bucket is the key prefix).

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('study_materials',      'study_materials_storage_provider_chk'),
      ('homework',             'homework_storage_provider_chk'),
      ('study_material_files', 'study_material_files_storage_provider_chk'),
      ('homework_files',       'homework_files_storage_provider_chk')
    ) AS t(tbl, chk)
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = r.tbl) THEN
      -- Widen the CHECK to include 'r2' (drop the old two-value constraint if present).
      IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = r.chk) THEN
        EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', r.tbl, r.chk);
      END IF;
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I CHECK (storage_provider IN (''supabase'', ''cloudinary'', ''r2''))',
        r.tbl, r.chk
      );
      -- New rows default to R2.
      EXECUTE format('ALTER TABLE %I ALTER COLUMN storage_provider SET DEFAULT ''r2''', r.tbl);
    END IF;
  END LOOP;
END $$;
