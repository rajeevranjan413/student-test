import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { notifyBatchStudents } from "@/utils/push";

// Scheduler hook (F15): push a "test is live" reminder for tests whose scheduled_at
// has just passed. Drive it from Vercel Cron / Supabase pg_cron every few minutes.
// Guarded by CRON_SECRET; notification_events dedupe makes repeated runs idempotent.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Only look back a short window so a freshly-connected cron doesn't blast reminders
// for every historical test at once. Dedupe still prevents repeats within it.
const LOOKBACK_MS = 6 * 60 * 60 * 1000; // 6 hours

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // disabled until configured
  const header = request.headers.get("authorization");
  const bearer = header?.startsWith("Bearer ") ? header.slice(7) : null;
  const query = new URL(request.url).searchParams.get("secret");
  return bearer === secret || query === secret;
}

export async function GET(request: Request) {
  if (!authorized(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const admin = createAdminClient();
    const now = new Date();
    const since = new Date(now.getTime() - LOOKBACK_MS).toISOString();

    // Published, non-archived tests that opened within the look-back window.
    const { data: quizzes, error } = await admin
      .from("quizzes")
      .select("id, title, batch_id, scheduled_at")
      .eq("status", "published")
      .is("archived_at", null)
      .lte("scheduled_at", now.toISOString())
      .gte("scheduled_at", since);
    if (error) throw error;

    const candidates = quizzes ?? [];
    for (const q of candidates) {
      await notifyBatchStudents(q.batch_id as string, {
        type: "test_live",
        refId: q.id as string,
        title: "Test is live now",
        body: (q.title as string) || "Your scheduled test is now available.",
        url: `/student/tests/${q.id as string}`,
        tag: `test-live-${q.id as string}`,
      });
    }

    return NextResponse.json({ ok: true, checked: candidates.length });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
