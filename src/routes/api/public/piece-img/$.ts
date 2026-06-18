import { createFileRoute } from "@tanstack/react-router";

/**
 * Public proxy that streams piece-image PNGs from the private storage bucket.
 * Path format: /api/public/piece-img/<user_id>/<piece_id>.png[?v=<timestamp>]
 *
 * We keep the bucket private (workspace policy blocks public buckets) and
 * mediate reads here so we can set a stable cache header. The `v=` query
 * busts CDN caches when a user replaces their image.
 */
export const Route = createFileRoute("/api/public/piece-img/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const path = params._splat ?? "";
        // Path safety: only allow the documented user_id/file.png shape.
        if (!/^[0-9a-f-]{36}\/[A-Za-z0-9._-]+\.png$/.test(path)) {
          return new Response("Not found", { status: 404 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.storage
          .from("piece-images")
          .download(path);
        if (error || !data) {
          return new Response("Not found", { status: 404 });
        }
        const buf = await data.arrayBuffer();
        return new Response(buf, {
          headers: {
            "Content-Type": "image/png",
            // Versioned URLs (?v=…) make this safe to cache hard.
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        });
      },
    },
  },
});
