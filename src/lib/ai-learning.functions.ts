/**
 * Cloud-synced "AI learning" loop.
 *
 * submitGameReport — auth-required. Called by the client at the end of every
 *   solo game. Writes a raw row to ai_training_games AND folds the result
 *   into the shared ai_playbook_stats row for that variant (running averages,
 *   so a single weird game can't tank it).
 *
 * getVariantPlaybook — public read. Returns the merged tuned values so the
 *   client engine can apply them on top of local defaults.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* ---------------- types shared with client ---------------- */

const ResultEnum = z.enum(["ai_win", "ai_loss", "draw"]);

const MoveZ = z.object({
  // Encoded "fromRC-toRC" or "drop@toRC"; from/to are r*100+c integers.
  m: z.string().min(2).max(20),
  // Piece id of the mover (or dropped piece). Short string.
  p: z.string().min(1).max(8),
  // Captured piece id, if any.
  c: z.string().min(1).max(8).optional(),
  // Whose move this was: 'w' or 'b'.
  s: z.enum(["w", "b"]),
});
export type ReportedMove = z.infer<typeof MoveZ>;

const SubmitInput = z.object({
  variantId: z.string().min(1).max(200),
  difficulty: z.enum(["easy", "medium", "hard"]),
  result: ResultEnum,
  aiColor: z.enum(["w", "b"]),
  moves: z.array(MoveZ).max(400),
});

export const submitGameReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SubmitInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // 1) Insert raw row (RLS-scoped to user).
    const { error: insErr } = await supabase
      .from("ai_training_games")
      .insert({
        user_id: userId,
        variant_id: data.variantId,
        difficulty: data.difficulty,
        result: data.result,
        ai_color: data.aiColor,
        move_count: data.moves.length,
        moves: data.moves,
      });
    if (insErr) throw new Error(insErr.message);

    // 2) Aggregate into ai_playbook_stats (service-role write).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing } = await supabaseAdmin
      .from("ai_playbook_stats")
      .select("*")
      .eq("variant_id", data.variantId)
      .maybeSingle();

    const aiWon = data.result === "ai_win";
    const aiLost = data.result === "ai_loss";
    const aiDrew = data.result === "draw";

    // Opening book: encode the first 12 AI plies. Key = "p@to" of each move.
    const openingKeyFor = (m: ReportedMove) => `${m.p}@${m.m.split("-").pop() ?? m.m}`;
    const openingMoves: string[] = [];
    let aiPlyCount = 0;
    for (const m of data.moves) {
      if (m.s === data.aiColor) {
        openingMoves.push(openingKeyFor(m));
        aiPlyCount += 1;
        if (aiPlyCount >= 12) break;
      }
    }

    // Piece trade outcomes: for each piece id involved in a capture by the AI,
    // and pieces captured FROM the AI, record win/loss tallies so the engine
    // can learn whether trading that piece tends to correlate with winning.
    const tradeDelta: Record<string, { wins: number; losses: number; draws: number }> = {};
    const bump = (id: string) => {
      if (!tradeDelta[id]) tradeDelta[id] = { wins: 0, losses: 0, draws: 0 };
      if (aiWon) tradeDelta[id].wins += 1;
      else if (aiLost) tradeDelta[id].losses += 1;
      else if (aiDrew) tradeDelta[id].draws += 1;
    };
    for (const m of data.moves) {
      if (!m.c) continue;
      // AI captured an enemy piece: trade involves both mover (AI piece) and captured piece.
      if (m.s === data.aiColor) {
        bump(m.p);
        bump(m.c);
      } else {
        // Human captured AI piece: still informative.
        bump(m.c);
        bump(m.p);
      }
    }

    const prevTrades = (existing?.piece_trade_outcomes as Record<string, { wins?: number; losses?: number; draws?: number }>) ?? {};
    const mergedTrades: Record<string, { wins: number; losses: number; draws: number }> = {};
    const allIds = new Set([...Object.keys(prevTrades), ...Object.keys(tradeDelta)]);
    for (const id of allIds) {
      const a = prevTrades[id] ?? {};
      const b = tradeDelta[id] ?? { wins: 0, losses: 0, draws: 0 };
      mergedTrades[id] = {
        wins: (a.wins ?? 0) + b.wins,
        losses: (a.losses ?? 0) + b.losses,
        draws: (a.draws ?? 0) + b.draws,
      };
    }

    const prevOpening = (existing?.opening_book as Record<string, { plays?: number; wins?: number }>) ?? {};
    const mergedOpening: Record<string, { plays: number; wins: number }> = { ...Object.fromEntries(
      Object.entries(prevOpening).map(([k, v]) => [k, { plays: v.plays ?? 0, wins: v.wins ?? 0 }]),
    ) };
    // Build cumulative prefix keys so partial-match lookup is cheap.
    for (let i = 1; i <= openingMoves.length; i++) {
      const key = openingMoves.slice(0, i).join("|");
      const cur = mergedOpening[key] ?? { plays: 0, wins: 0 };
      mergedOpening[key] = {
        plays: cur.plays + 1,
        wins: cur.wins + (aiWon ? 1 : aiDrew ? 0.5 : 0),
      };
    }
    // Keep the book bounded.
    const trimmedOpening = trimRecord(mergedOpening, 5000, (v) => v.plays);

    const row = {
      variant_id: data.variantId,
      games: (existing?.games ?? 0) + 1,
      ai_wins: (existing?.ai_wins ?? 0) + (aiWon ? 1 : 0),
      ai_losses: (existing?.ai_losses ?? 0) + (aiLost ? 1 : 0),
      ai_draws: (existing?.ai_draws ?? 0) + (aiDrew ? 1 : 0),
      piece_trade_outcomes: mergedTrades,
      opening_book: trimmedOpening,
      updated_at: new Date().toISOString(),
    };

    const { error: upErr } = await supabaseAdmin
      .from("ai_playbook_stats")
      .upsert(row, { onConflict: "variant_id" });
    if (upErr) throw new Error(upErr.message);

    return { ok: true };
  });

function trimRecord<T>(rec: Record<string, T>, max: number, weight: (v: T) => number): Record<string, T> {
  const entries = Object.entries(rec);
  if (entries.length <= max) return rec;
  entries.sort((a, b) => weight(b[1]) - weight(a[1]));
  return Object.fromEntries(entries.slice(0, max));
}

/* ---------------- public read of tuned playbook ---------------- */

const GetInput = z.object({
  variantId: z.string().min(1).max(200),
});

export interface CloudPlaybookData {
  games: number;
  aiWins: number;
  aiLosses: number;
  aiDraws: number;
  pieceTradeOutcomes: Record<string, { wins: number; losses: number; draws: number }>;
  openingBook: Record<string, { plays: number; wins: number }>;
}

export const getVariantPlaybook = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => GetInput.parse(input))
  .handler(async ({ data }): Promise<CloudPlaybookData | null> => {
    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) return null;
    const sb = createClient(url, key, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });
    const { data: row, error } = await sb
      .from("ai_playbook_stats")
      .select("*")
      .eq("variant_id", data.variantId)
      .maybeSingle();
    if (error || !row) return null;
    return {
      games: row.games ?? 0,
      aiWins: row.ai_wins ?? 0,
      aiLosses: row.ai_losses ?? 0,
      aiDraws: row.ai_draws ?? 0,
      pieceTradeOutcomes: (row.piece_trade_outcomes as CloudPlaybookData["pieceTradeOutcomes"]) ?? {},
      openingBook: (row.opening_book as CloudPlaybookData["openingBook"]) ?? {},
    };
  });
