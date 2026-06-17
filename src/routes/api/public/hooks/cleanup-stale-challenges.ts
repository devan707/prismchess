import { createFileRoute } from "@tanstack/react-router";

/** Cron-invoked sweep: deletes open (unjoined) challenges whose
 *  `expires_at` has passed. No body, no auth — `/api/public/*` is open,
 *  but the only operation here is "delete already-expired open invites",
 *  which has no leak risk. */
export const Route = createFileRoute("/api/public/hooks/cleanup-stale-challenges")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("matches")
          .delete()
          .eq("status", "open")
          .lt("expires_at", new Date().toISOString())
          .select("id");
        if (error) {
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }
        return Response.json({ ok: true, deleted: data?.length ?? 0 });
      },
      GET: async () =>
        Response.json({ ok: true, hint: "POST to run cleanup" }),
    },
  },
});
