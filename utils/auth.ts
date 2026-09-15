import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side auth helpers shared by every Route Handler.
 *
 * Roles in this codebase: the DB enum is ('student' | 'teacher') and `teacher`
 * is the spec's "admin". Use `requireTeacher` to gate admin-only endpoints and
 * `requireUser` for any authenticated endpoint.
 */

export type Role = "student" | "teacher";

export type AuthedUser = {
  id: string;
  email: string | null;
  role: Role;
};

/** Build a request-scoped Supabase client bound to the incoming cookies. */
export async function getSupabaseServer(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component — safe to ignore; middleware refreshes sessions.
          }
        },
      },
    }
  );
}

/** Resolve the authenticated user + role, or null if not signed in. */
export async function getAuthedUser(
  supabase: SupabaseClient
): Promise<AuthedUser | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  return {
    id: user.id,
    email: user.email ?? null,
    role: (profile?.role as Role) ?? "student",
  };
}

/** Thrown by the require* guards; carries the HTTP status to return. */
export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** Require any authenticated user. Returns { supabase, user }. */
export async function requireUser() {
  const supabase = await getSupabaseServer();
  const user = await getAuthedUser(supabase);
  if (!user) throw new AuthError("Unauthorized", 401);
  return { supabase, user };
}

/** Require an authenticated teacher (admin). Returns { supabase, user }. */
export async function requireTeacher() {
  const { supabase, user } = await requireUser();
  if (user.role !== "teacher") throw new AuthError("Forbidden", 403);
  return { supabase, user };
}

/** Require an authenticated student. Returns { supabase, user }. */
export async function requireStudent() {
  const { supabase, user } = await requireUser();
  if (user.role !== "student") throw new AuthError("Forbidden", 403);
  return { supabase, user };
}
