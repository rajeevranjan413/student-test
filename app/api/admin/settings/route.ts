// GET/PUT /api/admin/settings — the admin (teacher) reads and writes the runtime
// app settings (F17): the multi-batch registration code and the student home banners.
//
// Teacher-only. Reads/writes use the service-role client (app_settings is RLS
// teacher-only; the service role is used for consistency with the rest of the app and
// so banner object cleanup + HEAD checks work). GET returns the current values plus
// short-lived signed preview URLs for the banners; PUT upserts whichever keys are
// present in the body.

import { NextResponse } from "next/server";
import { AuthError, requireTeacher } from "@/utils/auth";
import { createAdminClient } from "@/utils/supabase/admin";
import {
  MAX_BANNERS,
  SETTINGS_BUCKET,
  SETTINGS_KEYS,
  getBannerItems,
  getRegistrationSecret,
  setSettingValue,
  type BannerItem,
} from "@/utils/settings";
import { headObject, removeObjects, signedUrl } from "@/utils/storage";

function handleError(error: unknown) {
  if (error instanceof AuthError)
    return NextResponse.json({ error: error.message }, { status: error.status });
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Unknown error" },
    { status: 500 }
  );
}

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

// GET — current settings for the admin screen.
export async function GET() {
  try {
    await requireTeacher();
    const admin = createAdminClient();

    const secret = await getRegistrationSecret(admin);
    const bannerItems = await getBannerItems(admin);

    // Sign a short-lived preview URL per banner (skip any object that has vanished).
    const banners = await Promise.all(
      bannerItems.map(async (b) => {
        try {
          const url = await signedUrl(
            { provider: "r2", path: b.key },
            { bucket: SETTINGS_BUCKET, mode: "view", fileName: "banner" }
          );
          return { key: b.key, alt: b.alt, url };
        } catch {
          return { key: b.key, alt: b.alt, url: null };
        }
      })
    );

    return NextResponse.json({
      registrationSecret: secret.value ?? "",
      registrationSecretSource: secret.source, // 'db' | 'env' | 'none'
      banners,
      maxBanners: MAX_BANNERS,
    });
  } catch (error) {
    return handleError(error);
  }
}

// PUT — upsert the settings present in the body:
//   { registrationSecret?: string, banners?: { key: string, alt?: string }[] }
export async function PUT(request: Request) {
  try {
    const { user } = await requireTeacher();
    const admin = createAdminClient();
    const body = await request.json().catch(() => ({}));

    // --- Registration code ---------------------------------------------------
    if (Object.prototype.hasOwnProperty.call(body, "registrationSecret")) {
      const value = body.registrationSecret;
      if (typeof value !== "string") return bad("Registration code must be text.");
      await setSettingValue(
        admin,
        SETTINGS_KEYS.registrationSecret,
        { value: value.trim() },
        user.id
      );
    }

    // --- Student banners -----------------------------------------------------
    if (Object.prototype.hasOwnProperty.call(body, "banners")) {
      const raw = body.banners;
      if (!Array.isArray(raw)) return bad("Banners must be a list.");
      if (raw.length > MAX_BANNERS)
        return bad(`You can configure at most ${MAX_BANNERS} banner images.`);

      // Normalize + validate each item.
      const items: BannerItem[] = [];
      for (const it of raw) {
        const key = String(it?.key ?? "").trim();
        const alt = String(it?.alt ?? "").trim();
        if (!key) return bad("Each banner needs an uploaded image.");
        // Guard the key namespace so a caller can't point a banner at some other
        // object (e.g. a private note) via a hand-crafted key.
        if (!key.startsWith(`${SETTINGS_BUCKET}/banners/`))
          return bad("A banner image key is invalid.");
        items.push({ key, alt });
      }

      // Every referenced object must actually exist in R2 (the browser uploaded it).
      for (const it of items) {
        const head = await headObject({ provider: "r2", path: it.key });
        if (!head) return bad("An uploaded banner image could not be found. Please re-upload.");
      }

      // Best-effort delete of objects for slides that were removed.
      const previous = await getBannerItems(admin);
      const keptKeys = new Set(items.map((i) => i.key));
      const orphans = previous
        .filter((p) => !keptKeys.has(p.key))
        .map((p) => ({ provider: "r2" as const, path: p.key }));
      if (orphans.length > 0) await removeObjects(SETTINGS_BUCKET, orphans);

      await setSettingValue(admin, SETTINGS_KEYS.studentBanners, { items }, user.id);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}
