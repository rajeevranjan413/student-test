// Server-only helpers for the admin "Students" screens (F5). Email and phone live
// in `auth.users`, not `profiles`, so they can only be read with the service-role
// client (`utils/supabase/admin.ts`). These are contact details — teacher-only, and
// never returned to a student session. Callers must have passed `requireTeacher`.

import { createAdminClient } from "./supabase/admin";

export type Contact = { email: string | null; phone: string | null };

/**
 * Build a map of `auth.users.id → { email, phone }` for the whole user base.
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
      map.set(u.id, { email: u.email ?? null, phone: u.phone ?? null });
    }
    if (users.length < perPage) break; // last page
  }

  return map;
}

/** Email + phone for a single user id, or nulls if not found. */
export async function contactFor(userId: string): Promise<Contact> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error) return { email: null, phone: null };
  return { email: data?.user?.email ?? null, phone: data?.user?.phone ?? null };
}
