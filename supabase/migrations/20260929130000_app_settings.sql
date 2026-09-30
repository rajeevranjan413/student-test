-- Application settings: a small key-value store the admin (teacher) can edit at
-- runtime from the new Settings screen (F17). One row per setting; the value is
-- `jsonb` so a setting can be a string, a list, or a small object without a
-- schema change as more settings are added later.
--
-- Current keys:
--   'registration_secret_pass' → { "value": "<code>" }
--        The center-wide code required to self-register for MULTIPLE batches at
--        once (F1 / D35). When present it OVERRIDES the REGISTRATION_SECRET_PASS
--        env; when absent the register route falls back to that env, so existing
--        deployments keep working with no DB row.
--   'student_banners'          → { "items": [ { "key": "<r2 object key>", "alt": "<text>" }, ... ] }
--        The image slides on the student home carousel (F12). When absent the
--        student home shows the bundled public/home/* defaults.
--
-- Security: RLS is on and ONLY teachers can read or write this table. Students
-- must never read 'registration_secret_pass'. The student banner list is served
-- to students by a server route using the service-role client (which bypasses
-- RLS) that returns ONLY signed image URLs — never the raw settings row.
--
-- Safe to re-run: table/policy creation is guarded (IF NOT EXISTS / drop-then-create).

CREATE TABLE IF NOT EXISTS public.app_settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Teacher-only: no student/anon policy at all, so a student JWT cannot read the
-- registration code (or any future secret) directly. Reads that students DO need
-- (the banner list) go through the service-role client in a dedicated route.
DROP POLICY IF EXISTS app_settings_select_teacher ON public.app_settings;
CREATE POLICY app_settings_select_teacher ON public.app_settings
  FOR SELECT TO authenticated
  USING (public.is_teacher());

DROP POLICY IF EXISTS app_settings_insert_teacher ON public.app_settings;
CREATE POLICY app_settings_insert_teacher ON public.app_settings
  FOR INSERT TO authenticated
  WITH CHECK (public.is_teacher());

DROP POLICY IF EXISTS app_settings_update_teacher ON public.app_settings;
CREATE POLICY app_settings_update_teacher ON public.app_settings
  FOR UPDATE TO authenticated
  USING (public.is_teacher())
  WITH CHECK (public.is_teacher());

DROP POLICY IF EXISTS app_settings_delete_teacher ON public.app_settings;
CREATE POLICY app_settings_delete_teacher ON public.app_settings
  FOR DELETE TO authenticated
  USING (public.is_teacher());
