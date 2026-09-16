import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseServer } from "@/utils/auth";

/**
 * Sign the current user out on THIS device so the same person can switch
 * accounts (e.g. teacher → student) without a stale session bouncing them
 * back to their old dashboard.
 *
 * Hardening vs. a bare `signOut()`:
 * - `scope: 'local'` — only this device's session; never revokes the user's
 *   other devices, and doesn't hinge on the global-revoke network call.
 * - Errors from `signOut` are swallowed: an expired/invalid token must still
 *   result in a signed-out browser, not a 500 that leaves cookies in place.
 * - As a safety net we explicitly expire every Supabase auth cookie, so the
 *   session is guaranteed gone even if the SSR client couldn't clear it.
 */
export async function POST() {
  const cookieStore = await cookies();

  try {
    const supabase = await getSupabaseServer();
    // Local scope + ignore the result: the goal is a signed-out browser here,
    // regardless of whether the server-side token revoke succeeds.
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // fall through to the manual cookie clear below
  }

  // Belt-and-suspenders: expire any leftover Supabase auth cookies
  // (`sb-<ref>-auth-token`, plus its chunked `.0`/`.1` variants).
  for (const cookie of cookieStore.getAll()) {
    if (cookie.name.startsWith("sb-") && cookie.name.includes("-auth-token")) {
      cookieStore.set(cookie.name, "", { maxAge: 0, path: "/" });
    }
  }

  return NextResponse.json({ message: "Logged out successfully" });
}
