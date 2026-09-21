// Server-only helpers for the admin "Students" screens (F5). Email and phone live
// in `auth.users`, not `profiles`, so they can only be read with the service-role
// client (`utils/supabase/admin.ts`). These are contact details — teacher-only, and
// never returned to a student session. Callers must have passed `requireTeacher`.

import { createAdminClient } from "./supabase/admin";

export type Contact = { email: string | null; phone: string | null; active: boolean };

/**
 * An account is **active** unless it is currently banned. Supabase stores a ban as
 * `auth.users.banned_until` (an ISO timestamp, or the string `"none"` when clear);
 * the field isn't in the typed `User` surface, so we read it defensively. A student
 * is deactivated by banning far into the future (F5) and reactivated by clearing it.
 */
function isActive(user: unknown): boolean {
  const bannedUntil = (user as { banned_until?: string | null } | null)?.banned_until;
  if (!bannedUntil || bannedUntil === "none") return true;
  const ts = Date.parse(bannedUntil);
  return Number.isNaN(ts) ? true : ts <= Date.now();
}

/**
 * Build a map of `auth.users.id → { email, phone, active }` for the whole user base.
 * `auth.admin.listUsers` is paginated (default 50/page); we page through with a
 * hard cap so a large user base can't spin forever.
 */
export async function contactsById(): Promise<Map<string, Contact>> {
  const admin = createAdminClient();
  const map = new Map<string, Contact>();
  const perPage = 1000;
  const maxPages = 50; // 50k users — well beyond a coaching center; guards runaway loops

  for (let page = 1; page <= maxPages; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = data?.users ?? [];
    for (const u of users) {
      map.set(u.id, {
        email: u.email ?? null,
        phone: u.phone ?? null,
        active: isActive(u),
      });
    }
    if (users.length < perPage) break; // last page
  }

  return map;
}

/** Email + phone + account status for a single user id, or nulls if not found. */
export async function contactFor(userId: string): Promise<Contact> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error) return { email: null, phone: null, active: true };
  return {
    email: data?.user?.email ?? null,
    phone: data?.user?.phone ?? null,
    active: isActive(data?.user),
  };
}
