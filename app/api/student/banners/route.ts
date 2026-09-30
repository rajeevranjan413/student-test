// GET /api/student/banners — the slides for the student home carousel (F12/F17).
//
// Any authenticated user. Reads the `student_banners` setting via the SERVICE ROLE
// (app_settings is RLS teacher-only, so a student can't read it directly) and returns
// ONLY short-lived signed image URLs — never the raw settings row. When the admin has
// not configured any banners the response is the bundled public/home/* defaults, so
// the student home looks the same until the admin customizes it.

import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/utils/auth";
import { createAdminClient } from "@/utils/supabase/admin";
import { SETTINGS_BUCKET, getBannerItems } from "@/utils/settings";
import { signedUrl } from "@/utils/storage";

/** Bundled fallback slides (shipped under public/home/*). Kept in sync with the
 *  student home's original hard-coded set so nothing regresses before the admin
 *  configures custom banners. These are static public paths, not R2 objects. */
const DEFAULT_BANNERS = [
  { url: "/home/hero.jpg", alt: "Neeraj Competitive Classes — felicitation ceremony" },
  { url: "/home/toppers.jpg", alt: "Celebrating a medal-winning student" },
  { url: "/home/banner.jpg", alt: "Our coaching center" },
  { url: "/home/felicitation.jpg", alt: "Celebrating a student's success" },
  { url: "/home/teachers-day.jpg", alt: "Teacher's Day at Neeraj Competitive Classes" },
  { url: "/home/award.jpg", alt: "Awarding a hard-working student" },
];

export async function GET() {
  try {
    await requireUser();
    const admin = createAdminClient();
    const items = await getBannerItems(admin);

    if (items.length === 0) {
      return NextResponse.json({ banners: DEFAULT_BANNERS, source: "default" });
    }

    // Sign each configured slide; drop any whose object has gone missing.
    const signed = await Promise.all(
      items.map(async (b) => {
        try {
          const url = await signedUrl(
            { provider: "r2", path: b.key },
            { bucket: SETTINGS_BUCKET, mode: "view", fileName: "banner" }
          );
          return { url, alt: b.alt };
        } catch {
          return null;
        }
      })
    );
    const banners = signed.filter((b): b is { url: string; alt: string } => b !== null);

    // If every configured object failed to sign, fall back to the bundled set.
    if (banners.length === 0) {
      return NextResponse.json({ banners: DEFAULT_BANNERS, source: "default" });
    }

    return NextResponse.json({ banners, source: "custom" });
  } catch (error) {
    if (error instanceof AuthError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
