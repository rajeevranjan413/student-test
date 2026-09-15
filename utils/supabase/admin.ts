import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client — SERVER ONLY. Uses the secret service-role key,
 * which **bypasses RLS and column privileges**. Only use it inside Route Handlers
 * (or their server-only helpers) AFTER the caller has been authenticated and
 * authorized (`requireStudent` / `requireTeacher`).
 *
 * Two things must go through this client now that RLS is on:
 *  1. Reading answer columns (`questions.correct_answer` / `explanation`) — these
 *     are column-REVOKEd from the browser JWT, so the user-scoped client can't
 *     read them for scoring / post-submit review.
 *  2. Writing `quiz_attempts` — the browser JWT has no write policy, so all
 *     attempt inserts/updates (start, autosave, finalize) are done here. This is
 *     what makes client-side score tampering impossible.
 *
 * Never import this into a client component — the key must never reach the browser.
 */
export function createAdminClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
