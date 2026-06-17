import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { VAPID_PUBLIC_KEY } from "./vapid";

export const getVapidPublicKey = createServerFn({ method: "GET" })
  .handler(async () => ({ key: VAPID_PUBLIC_KEY }));

const SubscriptionInput = z.object({
  endpoint: z.string().url().min(10).max(2000),
  p256dh: z.string().min(10).max(500),
  auth: z.string().min(10).max(500),
  userAgent: z.string().max(500).optional(),
});

export const savePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => SubscriptionInput.parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("push_subscriptions")
      .upsert(
        {
          user_id: context.userId,
          endpoint: data.endpoint,
          p256dh: data.p256dh,
          auth: data.auth,
          user_agent: data.userAgent ?? null,
          last_used_at: new Date().toISOString(),
        },
        { onConflict: "endpoint" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deletePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ endpoint: z.string().url().min(10).max(2000) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await context.supabase
      .from("push_subscriptions")
      .delete()
      .eq("user_id", context.userId)
      .eq("endpoint", data.endpoint);
    return { ok: true };
  });

/** Called on sign-out and from the unload beacon — drops all of the user's
 *  open (unjoined) challenges so nobody can accept a stale invite. */
export const cancelMyOpenChallenges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("matches")
      .delete()
      .eq("host_id", context.userId)
      .eq("status", "open");
    if (error) throw new Error(error.message);
    return { ok: true };
  });
