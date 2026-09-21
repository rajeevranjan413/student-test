import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/utils/auth";
import { createAdminClient } from "@/utils/supabase/admin";

// Web Push subscriptions (F15). A signed-in user registers / removes THIS device's
// push endpoint. Writes go through the service role (push_subscriptions has no client
// write policy); the user_id is always taken from the session, never the client.
export const runtime = "nodejs";

function handleError(error: unknown) {
  if (error instanceof AuthError)
    return NextResponse.json({ error: error.message }, { status: error.status });
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Unknown error" },
    { status: 500 }
  );
}

type IncomingSub = {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
};

// POST /api/push/subscribe — upsert this device's subscription.
export async function POST(request: Request) {
  try {
    const { user } = await requireUser();
    const sub = (await request.json()) as IncomingSub;
    const endpoint = sub.endpoint?.trim();
    const p256dh = sub.keys?.p256dh;
    const auth = sub.keys?.auth;

    if (!endpoint || !p256dh || !auth)
      return NextResponse.json(
        { error: "A complete push subscription (endpoint + keys) is required." },
        { status: 400 }
      );

    const admin = createAdminClient();
    const nowIso = new Date().toISOString();
    // Upsert on the unique endpoint: re-subscribing the same device (or one that
    // changed hands) reassigns it to the current user and refreshes its keys.
    const { error } = await admin.from("push_subscriptions").upsert(
      {
        user_id: user.id,
        endpoint,
        p256dh,
        auth,
        user_agent: request.headers.get("user-agent") ?? null,
        last_seen_at: nowIso,
      },
      { onConflict: "endpoint" }
    );
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}

// DELETE /api/push/subscribe — remove this device's subscription.
export async function DELETE(request: Request) {
  try {
    const { user } = await requireUser();
    const sub = (await request.json().catch(() => ({}))) as IncomingSub;
    const endpoint = sub.endpoint?.trim();
    if (!endpoint)
      return NextResponse.json({ error: "endpoint is required." }, { status: 400 });

    const admin = createAdminClient();
    // Scope the delete to the caller so one user can't drop another's subscription.
    const { error } = await admin
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", endpoint)
      .eq("user_id", user.id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}
