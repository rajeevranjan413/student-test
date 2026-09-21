-- Student push notifications (F15). DECISIONS D30.
--
-- Web Push (VAPID): a student "subscribes" a device (its push endpoint + keys) and
-- the server pushes a notification when new homework / study material / a test is
-- posted, plus a "test is live" reminder from a cron. Two additive tables:
--   1. push_subscriptions  — one row per device push endpoint.
--   2. notification_events — a (type, ref_id, user_id) dedupe/audit log so a student
--      is never double-notified (critical for the idempotent test-live cron).
--
-- Additive & idempotent: two NEW tables + indexes + policies (dropped-then-created).
-- No existing column is renamed or dropped. Reuses the RLS helper
-- `public.is_teacher()` from 20260915140000_enable_rls.sql.
--
-- Security model (mirrors quiz_attempts, D11):
--   * NO client write policy on either table — all writes go through the service role
--     after the caller passed requireUser (the user_id is the authed user, never
--     client-supplied). The VAPID private key that signs pushes lives only in env.
--   * A user may SELECT only their own subscription rows (defense-in-depth); the
--     dedupe log is service-role only.

-- ---------------------------------------------------------------------------
-- 1. push_subscriptions — one row per device/browser Web Push endpoint.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint     text NOT NULL UNIQUE,          -- the push service URL (subscription identity)
  p256dh       text NOT NULL,                 -- subscription public key (Web Push encryption)
  auth         text NOT NULL,                 -- subscription auth secret (Web Push encryption)
  user_agent   text,                          -- browser UA at subscribe time (debugging)
  created_at   timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  last_seen_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx
  ON push_subscriptions(user_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- A user may read their own subscriptions; teachers may read all (support/debug).
DROP POLICY IF EXISTS push_subscriptions_select_own ON push_subscriptions;
CREATE POLICY push_subscriptions_select_own ON push_subscriptions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_teacher());
-- No INSERT/UPDATE/DELETE policy: all writes go through the service role.

-- ---------------------------------------------------------------------------
-- 2. notification_events — dedupe / audit log. UNIQUE (type, ref_id, user_id)
--    guarantees one notification per student per event; every fan-out claims its
--    rows first and only pushes the newly-claimed users.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notification_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type       text NOT NULL,   -- 'homework' | 'study_material' | 'test_published' | 'test_live'
  ref_id     uuid NOT NULL,   -- the subject row (homework / material / quiz id)
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notification_events_dedupe_key'
  ) THEN
    ALTER TABLE notification_events
      ADD CONSTRAINT notification_events_dedupe_key UNIQUE (type, ref_id, user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS notification_events_user_idx
  ON notification_events(user_id);

ALTER TABLE notification_events ENABLE ROW LEVEL SECURITY;
-- No policy at all: readable/writable only by the service role (server-side).
