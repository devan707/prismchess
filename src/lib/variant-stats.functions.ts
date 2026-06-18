import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const RecordInput = z.object({
  variantKey: z.string().min(1).max(200),
});

/**
 * Increment the current user's per-variant play count by 1.
 * Idempotent per (variant_key, user_id) — uses upsert.
 */
export const recordVariantPlay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RecordInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Read current value, then upsert with plays+1. Two round-trips, but
    // there's no RPC and we want it tolerant of a missing row.
    const { data: existing } = await supabase
      .from("variant_plays")
      .select("plays")
      .eq("variant_key", data.variantKey)
      .eq("user_id", userId)
      .maybeSingle();
    const nextPlays = (existing?.plays ?? 0) + 1;
    const { error } = await supabase
      .from("variant_plays")
      .upsert(
        { variant_key: data.variantKey, user_id: userId, plays: nextPlays },
        { onConflict: "variant_key,user_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true, plays: nextPlays };
  });

const StatsInput = z.object({
  variantKeys: z.array(z.string().min(1).max(200)).max(200),
});

export interface VariantStats {
  unique: number;
  total: number;
}

/**
 * Public read of aggregate play stats for a batch of variant keys.
 * Uses the publishable-key server client so unauthenticated visitors on the
 * landing page still see counts.
 */
export const getVariantStats = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => StatsInput.parse(input))
  .handler(async ({ data }): Promise<Record<string, VariantStats>> => {
    if (data.variantKeys.length === 0) return {};
    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) return {};
    const sb = createClient(url, key, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });
    const { data: rows, error } = await sb
      .from("variant_play_stats")
      .select("variant_key, unique_players, total_plays")
      .in("variant_key", data.variantKeys);
    if (error) return {};
    const out: Record<string, VariantStats> = {};
    for (const k of data.variantKeys) out[k] = { unique: 0, total: 0 };
    for (const row of rows ?? []) {
      out[row.variant_key as string] = {
        unique: Number(row.unique_players ?? 0),
        total: Number(row.total_plays ?? 0),
      };
    }
    return out;
  });
