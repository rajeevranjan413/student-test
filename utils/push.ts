import webpush from "web-push";
import { createAdminClient } from "@/utils/supabase/admin";

/**
 * Web Push (VAPID) fan-out — SERVER ONLY. Powers student notifications (F15).
 *
 * Every public entry point is **best-effort**: it never throws, so a push failure
 * can never break the teacher action (creating homework / a test / a note) that
 * triggered it. It also **no-ops cleanly** when VAPID isn't configured, so the app
 * builds and runs exactly as before without keys. See docs/DECISIONS.md D30.
 */

export type NotificationType =
  | "homework"
  | "study_material"
  | "test_published"
  | "test_live";

export type PushPayload = {
  /** Event kind — also the dedupe key with `refId` + user (notification_events). */
  type: NotificationType;
  /** The subject row id (homework / material / quiz) the event is about. */
  refId: string;
  /** Notification title. */
  title: string;
  /** Notification body — the item name; NEVER answers or private data (F10). */
  body: string;
  /** Deep link opened / focused when the notification is tapped. */
  url: string;
  /** Optional collapse tag so repeats of the same item replace, not stack. */
  tag?: string;
};

let vapidReady: boolean | null = null;

/** Configure web-push once from env. Returns false (and disables push) if unset. */
function ensureVapid(): boolean {
  if (vapidReady !== null) return vapidReady;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@example.com";
  if (!publicKey || !privateKey) {
    vapidReady = false;
    return false;
  }
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    vapidReady = true;
  } catch {
    vapidReady = false;
  }
  return vapidReady;
}

/** Notify every student enrolled in a batch. Best-effort; never throws. */
export async function notifyBatchStudents(
  batchId: string,
  payload: PushPayload
): Promise<void> {
  try {
    if (!ensureVapid()) return;
    const admin = createAdminClient();
    const { data: enrollments, error } = await admin
      .from("student_batches")
      .select("student_id")
      .eq("batch_id", batchId);
    if (error) return;
    const studentIds = (enrollments ?? [])
      .map((r) => r.student_id as string)
      .filter(Boolean);
    if (studentIds.length === 0) return;
    await notifyUsers(studentIds, payload);
  } catch {
    // Swallow — a notification failure must never break the triggering action.
  }
}

/**
 * Notify a set of users. Dedupes on (type, ref_id, user_id) via notification_events
 * so each user is pushed at most once per event, then delivers to each of their
 * device subscriptions, pruning any endpoint the push service reports as gone.
 */
export async function notifyUsers(
  userIds: string[],
  payload: PushPayload
): Promise<void> {
  try {
    if (!ensureVapid()) return;
    if (userIds.length === 0) return;
    const admin = createAdminClient();

    // Claim the dedupe rows; ON CONFLICT DO NOTHING → only NEW rows come back, i.e.
    // exactly the users who haven't been notified for this event yet.
    const uniqueIds = Array.from(new Set(userIds));
    const { data: claimed, error: claimErr } = await admin
      .from("notification_events")
      .upsert(
        uniqueIds.map((uid) => ({
          type: payload.type,
          ref_id: payload.refId,
          user_id: uid,
        })),
        { onConflict: "type,ref_id,user_id", ignoreDuplicates: true }
      )
      .select("user_id");
    if (claimErr) return;

    const targetIds = (claimed ?? []).map((r) => r.user_id as string);
    if (targetIds.length === 0) return;

    const { data: subs, error: subsErr } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .in("user_id", targetIds);
    if (subsErr || !subs || subs.length === 0) return;

    const body = JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: payload.url,
      tag: payload.tag ?? `${payload.type}-${payload.refId}`,
    });

    const stale: string[] = [];
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: s.endpoint as string,
              keys: { p256dh: s.p256dh as string, auth: s.auth as string },
            },
            body
          );
        } catch (err) {
          const code = (err as { statusCode?: number }).statusCode;
          // 404/410 → the endpoint is gone; drop it so we stop trying.
          if (code === 404 || code === 410) stale.push(s.id as string);
        }
      })
    );

    if (stale.length > 0) {
      await admin.from("push_subscriptions").delete().in("id", stale);
    }
  } catch {
    // Best-effort — swallow.
  }
}
