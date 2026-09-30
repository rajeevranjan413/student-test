// Application settings — the runtime, admin-editable key-value store (F17).
// SERVER ONLY: every read/write here uses the service-role client (bypasses RLS),
// so import this only from Route Handlers. Callers must already be authorized
// (teacher for writes; the banner read is safe to expose to any authed user
// because it returns only images, never the raw settings row).

import type { SupabaseClient } from "@supabase/supabase-js";

/** Setting keys stored in `app_settings.key`. */
export const SETTINGS_KEYS = {
  registrationSecret: "registration_secret_pass",
  studentBanners: "student_banners",
} as const;

/** The R2 logical bucket / key prefix root for settings-owned uploads (banners). */
export const SETTINGS_BUCKET = "settings";

/** Max number of banner slides the admin can configure. */
export const MAX_BANNERS = 8;

/** One configured banner slide as stored in the settings row. */
export type BannerItem = { key: string; alt: string };

/** Read a raw setting value (jsonb). Returns null when the row is absent. */
export async function getSettingValue(
  admin: SupabaseClient,
  key: string
): Promise<unknown | null> {
  const { data, error } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error) throw error;
  return data?.value ?? null;
}

/** Upsert a setting value, stamping who changed it. */
export async function setSettingValue(
  admin: SupabaseClient,
  key: string,
  value: unknown,
  userId: string
): Promise<void> {
  const { error } = await admin
    .from("app_settings")
    .upsert(
      { key, value, updated_at: new Date().toISOString(), updated_by: userId },
      { onConflict: "key" }
    );
  if (error) throw error;
}

/**
 * The effective multi-batch registration code (F1 / D35): the DB setting when a
 * non-empty one exists, otherwise the REGISTRATION_SECRET_PASS env fallback.
 * Returns null when neither is set (multi-batch self-registration is then disabled).
 */
export async function getRegistrationSecret(
  admin: SupabaseClient
): Promise<{ value: string | null; source: "db" | "env" | "none" }> {
  const raw = await getSettingValue(admin, SETTINGS_KEYS.registrationSecret);
  const dbValue =
    raw && typeof raw === "object" && typeof (raw as { value?: unknown }).value === "string"
      ? ((raw as { value: string }).value.trim() || null)
      : null;
  if (dbValue) return { value: dbValue, source: "db" };

  const env = process.env.REGISTRATION_SECRET_PASS?.trim() || null;
  if (env) return { value: env, source: "env" };

  return { value: null, source: "none" };
}

/** Read the configured banner list (empty array when unset or malformed). */
export async function getBannerItems(admin: SupabaseClient): Promise<BannerItem[]> {
  const raw = await getSettingValue(admin, SETTINGS_KEYS.studentBanners);
  const items =
    raw && typeof raw === "object" && Array.isArray((raw as { items?: unknown }).items)
      ? (raw as { items: unknown[] }).items
      : [];
  return items.flatMap((it) => {
    if (!it || typeof it !== "object") return [];
    const key = (it as { key?: unknown }).key;
    const alt = (it as { alt?: unknown }).alt;
    if (typeof key !== "string" || !key) return [];
    return [{ key, alt: typeof alt === "string" ? alt : "" }];
  });
}
