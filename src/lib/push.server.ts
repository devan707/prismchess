// Server-only push helpers. Never import from client code.
import webpush from "web-push";
import { VAPID_PUBLIC_KEY, VAPID_SUBJECT } from "./vapid";

let configured = false;
function configure() {
  if (configured) return;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("VAPID_PRIVATE_KEY is not configured");
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, privateKey);
  configured = true;
}

export interface PushPayload {
  title: string;
  body: string;
  /** Click target — relative path inside the app. */
  url?: string;
  /** Used to coalesce repeated notifications for the same conversation/match. */
  tag?: string;
  icon?: string;
}

/** Send a notification to every device a user has registered. Best-effort:
 *  failed sends are logged but never thrown. Expired endpoints are purged. */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  try {
    configure();
  } catch (e) {
    console.warn("[push] not configured, skipping:", (e as Error).message);
    return;
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Respect the recipient's opt-in: every push we send today is gameplay-related
  // (your move, challenge accepted, draw/rematch offers, DMs, friend requests).
  // If the user opted out of gameplay notifications, don't even fetch their subs.
  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("gameplay_notify_opt_in")
    .eq("id", userId)
    .maybeSingle();
  if (prof && prof.gameplay_notify_opt_in === false) return;

  const { data: subs, error } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);
  if (error) {
    console.warn("[push] fetch subs failed:", error.message);
    return;
  }
  if (!subs || subs.length === 0) return;

  const body = JSON.stringify(payload);
  const stale: string[] = [];
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
          { TTL: 60 * 60 * 12 },
        );
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          stale.push(s.id);
        } else {
          console.warn("[push] send failed:", status, (err as Error).message);
        }
      }
    }),
  );
  if (stale.length) {
    await supabaseAdmin.from("push_subscriptions").delete().in("id", stale);
  }
}

/** Fire-and-forget — never block the caller on push delivery. */
export function sendPushBackground(userId: string, payload: PushPayload): void {
  sendPushToUser(userId, payload).catch((e) => {
    console.warn("[push] background error:", (e as Error).message);
  });
}
