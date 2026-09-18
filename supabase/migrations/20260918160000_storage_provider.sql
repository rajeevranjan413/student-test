-- Dual file storage: Supabase Storage + Cloudinary (DECISIONS D27). The maintainer
-- wants NEW uploads to be able to go to Cloudinary once the Supabase free-tier
-- storage fills up, while files already uploaded keep serving from wherever they
-- live. So every file-bearing row records WHICH provider holds its bytes.
--
-- Additive & idempotent: adds one column (`storage_provider`) to the two tables that
-- store file bytes (`study_materials`, `homework`) with a safe default of
-- 'supabase', so every existing row keeps pointing at the Supabase bucket and no
-- code path breaks. Nothing is renamed or dropped. A guarded CHECK constrains the
-- value to the two known providers. Re-runs are safe.
--
-- The meaning of `file_path` becomes provider-relative:
--   * storage_provider='supabase'   → object path inside the private bucket
--                                      (e.g. `<batch>/<subject>/<uuid>.pdf`) — unchanged.
--   * storage_provider='cloudinary' → the Cloudinary public_id of a private
--                                      ('authenticated', resource_type 'raw') asset
--                                      (e.g. `study-material/<batch>/<subject>/<uuid>.pdf`).
-- See `utils/storage.ts` for the provider-agnostic upload / signed-URL / delete layer.

-- study_materials (F13) --------------------------------------------------------
ALTER TABLE study_materials
  ADD COLUMN IF NOT EXISTS storage_provider text NOT NULL DEFAULT 'supabase';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'study_materials_storage_provider_chk'
  ) THEN
    ALTER TABLE study_materials
      ADD CONSTRAINT study_materials_storage_provider_chk
      CHECK (storage_provider IN ('supabase', 'cloudinary'));
  END IF;
END $$;

-- homework (F14) — the `file`-kind rows store bytes too -------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'homework') THEN
    ALTER TABLE homework
      ADD COLUMN IF NOT EXISTS storage_provider text NOT NULL DEFAULT 'supabase';

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'homework_storage_provider_chk'
    ) THEN
      ALTER TABLE homework
        ADD CONSTRAINT homework_storage_provider_chk
        CHECK (storage_provider IN ('supabase', 'cloudinary'));
    END IF;
  END IF;
END $$;
