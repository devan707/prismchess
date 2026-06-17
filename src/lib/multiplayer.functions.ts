import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Design, Move, Color } from "@/game/types";

const TC_BUDGET_MS: Record<string, number> = {
  "10min": 10 * 60 * 1000,
  "30min": 30 * 60 * 1000,
  "3day": 3 * 24 * 60 * 60 * 1000,
};
const TC_PER_MOVE: Record<string, boolean> = {
  "10min": false,
  "30min": false,
  "3day": true,
};

const TimeControl = z.enum(["10min", "30min", "3day"]);
const Visibility = z.enum(["public", "link"]);
const ColorSchema = z.enum(["w", "b"]);

// Loose Move shape — server stores it as jsonb and replays via the engine when needed.
const MoveSchema = z.object({}).passthrough();
const DesignSchema = z.object({}).passthrough();

// ─── Create ─────────────────────────────────────────────────────────────────
export const createChallenge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        design: DesignSchema,
        designName: z.string().min(1).max(80),
        timeControl: TimeControl,
        hostColor: ColorSchema,
        visibility: Visibility,
        rated: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const budget = TC_BUDGET_MS[data.timeControl];
    const { data: row, error } = await context.supabase
      .from("matches")
      .insert({
        host_id: context.userId,
        design: data.design as unknown as Record<string, unknown>,
        design_name: data.designName,
        time_control: data.timeControl,
        host_color: data.hostColor,
        visibility: data.visibility,
        rated: data.rated ?? false,
        white_time_ms: budget,
        black_time_ms: budget,
        turn: "w",
      })
      .select("id, share_token")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string, shareToken: row.share_token as string };
  });

// ─── Lobby ─────────────────────────────────────────────────────────────────
export const listOpenChallenges = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: rows, error } = await context.supabase
      .from("matches")
      .select("id, host_id, design_name, time_control, host_color, rated, created_at, visibility")
      .eq("status", "open")
      .eq("visibility", "public")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    const hostIds = Array.from(new Set((rows ?? []).map((r) => r.host_id)));
    const profMap: Record<string, { username: string; display_name: string | null }> = {};
    if (hostIds.length) {
      const { data: profs } = await context.supabase
        .from("profiles")
        .select("id, username, display_name")
        .in("id", hostIds);
      for (const p of profs ?? []) profMap[p.id] = { username: p.username, display_name: p.display_name };
    }
    return (rows ?? []).map((r) => ({
      ...r,
      host: profMap[r.host_id] ?? null,
      is_mine: r.host_id === context.userId,
    }));
  });

export const listMyMatches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: rows, error } = await context.supabase
      .from("matches")
      .select(
        "id, host_id, guest_id, design_name, time_control, status, host_color, turn, result, result_reason, created_at, updated_at, finished_at",
      )
      .or(`host_id.eq.${context.userId},guest_id.eq.${context.userId}`)
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    const userIds = Array.from(
      new Set((rows ?? []).flatMap((r) => [r.host_id, r.guest_id].filter(Boolean) as string[])),
    );
    const profMap: Record<string, { username: string; display_name: string | null }> = {};
    if (userIds.length) {
      const { data: profs } = await context.supabase
        .from("profiles")
        .select("id, username, display_name")
        .in("id", userIds);
      for (const p of profs ?? []) profMap[p.id] = { username: p.username, display_name: p.display_name };
    }
    return (rows ?? []).map((r) => ({
      ...r,
      host: profMap[r.host_id] ?? null,
      guest: r.guest_id ? profMap[r.guest_id] ?? null : null,
      i_am: r.host_id === context.userId ? "host" : "guest",
    }));
  });

// ─── Read one match ────────────────────────────────────────────────────────
export const getMatch = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ matchId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: match, error } = await context.supabase
      .from("matches")
      .select("*")
      .eq("id", data.matchId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!match) throw new Error("Match not found.");

    const { data: moves } = await context.supabase
      .from("match_moves")
      .select("ply, move, actor_id, time_left_ms, played_at")
      .eq("match_id", data.matchId)
      .order("ply", { ascending: true });

    const { data: events } = await context.supabase
      .from("match_events")
      .select("id, kind, actor_id, payload, created_at")
      .eq("match_id", data.matchId)
      .order("created_at", { ascending: true });

    const ids = Array.from(new Set([match.host_id, match.guest_id].filter(Boolean) as string[]));
    const profMap: Record<string, { username: string; display_name: string | null }> = {};
    if (ids.length) {
      const { data: profs } = await context.supabase
        .from("profiles")
        .select("id, username, display_name")
        .in("id", ids);
      for (const p of profs ?? []) profMap[p.id] = { username: p.username, display_name: p.display_name };
    }
    return {
      match: {
        ...match,
        host: profMap[match.host_id] ?? null,
        guest: match.guest_id ? profMap[match.guest_id] ?? null : null,
      },
      moves: moves ?? [],
      events: events ?? [],
      meId: context.userId,
    };
  });

// ─── Get by token (for the join landing page) ──────────────────────────────
export const getMatchByToken = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ token: z.string().min(1).max(64) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: match, error } = await context.supabase
      .from("matches")
      .select("id, host_id, status, design_name, time_control, host_color")
      .eq("share_token", data.token)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!match) throw new Error("Challenge not found.");
    const { data: host } = await context.supabase
      .from("profiles")
      .select("id, username, display_name")
      .eq("id", match.host_id)
      .maybeSingle();
    return { match, host, meId: context.userId };
  });

// ─── Join ──────────────────────────────────────────────────────────────────
export const joinMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        matchId: z.string().uuid().optional(),
        token: z.string().min(1).max(64).optional(),
      })
      .refine((v) => v.matchId || v.token, { message: "matchId or token required" })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const filter = data.matchId ? { id: data.matchId } : { share_token: data.token! };
    const { data: match, error: fErr } = await context.supabase
      .from("matches")
      .select("id, host_id, guest_id, status")
      .match(filter)
      .maybeSingle();
    if (fErr) throw new Error(fErr.message);
    if (!match) throw new Error("Match not found.");
    if (match.status !== "open") {
      // If already joined as this user, just return success.
      if (match.guest_id === context.userId) return { id: match.id };
      throw new Error("This challenge is no longer open.");
    }
    if (match.host_id === context.userId) throw new Error("You can't join your own challenge.");

    const now = new Date().toISOString();
    const { error } = await context.supabase
      .from("matches")
      .update({
        guest_id: context.userId,
        status: "active",
        started_at: now,
        last_clock_update_at: now,
      })
      .eq("id", match.id)
      .eq("status", "open");
    if (error) throw new Error(error.message);
    return { id: match.id };
  });

// ─── Cancel ────────────────────────────────────────────────────────────────
export const cancelChallenge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ matchId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("matches")
      .delete()
      .eq("id", data.matchId)
      .eq("host_id", context.userId)
      .eq("status", "open");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ─── Submit move ───────────────────────────────────────────────────────────
export const submitMove = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      matchId: z.string().uuid(),
      ply: z.number().int().min(0),
      move: MoveSchema,
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: match, error: mErr } = await context.supabase
      .from("matches")
      .select("id, host_id, guest_id, host_color, status, turn, white_time_ms, black_time_ms, last_clock_update_at, time_control")
      .eq("id", data.matchId)
      .maybeSingle();
    if (mErr) throw new Error(mErr.message);
    if (!match) throw new Error("Match not found.");
    if (match.status !== "active") throw new Error("This match is not active.");

    const meColor: Color =
      context.userId === match.host_id ? (match.host_color as Color)
      : context.userId === match.guest_id ? (match.host_color === "w" ? "b" : "w")
      : (() => { throw new Error("Not a player in this match."); })();
    if (match.turn !== meColor) throw new Error("Not your turn.");

    const { count, error: cErr } = await context.supabase
      .from("match_moves")
      .select("*", { count: "exact", head: true })
      .eq("match_id", data.matchId);
    if (cErr) throw new Error(cErr.message);
    if ((count ?? 0) !== data.ply) throw new Error("Move out of order — try again.");

    const now = Date.now();
    const lastAt = match.last_clock_update_at ? new Date(match.last_clock_update_at).getTime() : now;
    const elapsed = Math.max(0, now - lastAt);
    const budget = TC_BUDGET_MS[match.time_control] ?? TC_BUDGET_MS["10min"];
    const perMove = TC_PER_MOVE[match.time_control] ?? false;

    const remainingBefore = meColor === "w" ? match.white_time_ms : match.black_time_ms;
    const remainingAfter = Math.max(0, remainingBefore - elapsed);

    if (remainingAfter <= 0 && !perMove) {
      // Timeout — opponent wins.
      const winner: Color = meColor === "w" ? "b" : "w";
      await context.supabase.from("matches").update({
        status: "finished",
        result: winner,
        result_reason: "timeout",
        finished_at: new Date().toISOString(),
        white_time_ms: meColor === "w" ? 0 : match.white_time_ms,
        black_time_ms: meColor === "b" ? 0 : match.black_time_ms,
      }).eq("id", data.matchId);
      throw new Error("Time's up — you lost on time.");
    }

    // After the move, reset to budget on per-move time control.
    const moverNewTime = perMove ? budget : remainingAfter;
    const update: Record<string, unknown> = {
      turn: meColor === "w" ? "b" : "w",
      white_time_ms: meColor === "w" ? moverNewTime : match.white_time_ms,
      black_time_ms: meColor === "b" ? moverNewTime : match.black_time_ms,
      last_clock_update_at: new Date(now).toISOString(),
    };
    const { error: uErr } = await context.supabase.from("matches").update(update).eq("id", data.matchId);
    if (uErr) throw new Error(uErr.message);

    const { error: iErr } = await context.supabase.from("match_moves").insert({
      match_id: data.matchId,
      ply: data.ply,
      move: data.move as Record<string, unknown>,
      actor_id: context.userId,
      time_left_ms: moverNewTime,
    });
    if (iErr) throw new Error(iErr.message);

    return { ok: true };
  });

// ─── Resign ────────────────────────────────────────────────────────────────
export const resign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ matchId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: match, error } = await context.supabase
      .from("matches")
      .select("host_id, guest_id, host_color, status")
      .eq("id", data.matchId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!match) throw new Error("Match not found.");
    if (match.status !== "active") throw new Error("Match is not active.");
    const meColor: Color =
      context.userId === match.host_id ? (match.host_color as Color)
      : context.userId === match.guest_id ? (match.host_color === "w" ? "b" : "w")
      : (() => { throw new Error("Not a player in this match."); })();
    const winner: Color = meColor === "w" ? "b" : "w";
    const { error: uErr } = await context.supabase.from("matches").update({
      status: "finished",
      result: winner,
      result_reason: "resign",
      finished_at: new Date().toISOString(),
    }).eq("id", data.matchId);
    if (uErr) throw new Error(uErr.message);
    await context.supabase.from("match_events").insert({
      match_id: data.matchId,
      kind: "resign",
      actor_id: context.userId,
      payload: {},
    });
    return { ok: true };
  });

// ─── Mark finished by terminal board state (checkmate/stalemate/royal-loss) ─
export const markFinished = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        matchId: z.string().uuid(),
        reason: z.enum(["checkmate", "stalemate", "royal_loss"]),
        winner: z.enum(["w", "b"]).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: match, error } = await context.supabase
      .from("matches")
      .select("host_id, guest_id, status")
      .eq("id", data.matchId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!match) throw new Error("Match not found.");
    if (match.status !== "active") return { ok: true };
    if (context.userId !== match.host_id && context.userId !== match.guest_id) {
      throw new Error("Not a player in this match.");
    }
    const result = data.winner ?? "draw";
    const { error: uErr } = await context.supabase.from("matches").update({
      status: "finished",
      result,
      result_reason: data.reason,
      finished_at: new Date().toISOString(),
    }).eq("id", data.matchId);
    if (uErr) throw new Error(uErr.message);
    return { ok: true };
  });

// ─── Draw offer / response ─────────────────────────────────────────────────
export const offerDraw = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ matchId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("match_events").insert({
      match_id: data.matchId,
      kind: "draw_offer",
      actor_id: context.userId,
      payload: {},
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const respondDraw = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ matchId: z.string().uuid(), accept: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await context.supabase.from("match_events").insert({
      match_id: data.matchId,
      kind: data.accept ? "draw_accept" : "draw_decline",
      actor_id: context.userId,
      payload: {},
    });
    if (data.accept) {
      await context.supabase.from("matches").update({
        status: "finished",
        result: "draw",
        result_reason: "draw_agreed",
        finished_at: new Date().toISOString(),
      }).eq("id", data.matchId).eq("status", "active");
    }
    return { ok: true };
  });

// ─── Claim opponent's timeout (lazy enforcement when no one moves) ─────────
export const claimTimeout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ matchId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: match, error } = await context.supabase
      .from("matches")
      .select("host_id, guest_id, host_color, status, turn, white_time_ms, black_time_ms, last_clock_update_at, time_control")
      .eq("id", data.matchId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!match) throw new Error("Match not found.");
    if (match.status !== "active") throw new Error("Match is not active.");
    if (context.userId !== match.host_id && context.userId !== match.guest_id) {
      throw new Error("Not a player in this match.");
    }
    const sideToMove = match.turn as Color;
    const remaining = sideToMove === "w" ? match.white_time_ms : match.black_time_ms;
    const lastAt = match.last_clock_update_at ? new Date(match.last_clock_update_at).getTime() : Date.now();
    const elapsed = Math.max(0, Date.now() - lastAt);
    if (remaining - elapsed > 0) throw new Error("Opponent still has time.");
    const winner: Color = sideToMove === "w" ? "b" : "w";
    await context.supabase.from("matches").update({
      status: "finished",
      result: winner,
      result_reason: "timeout",
      finished_at: new Date().toISOString(),
      white_time_ms: sideToMove === "w" ? 0 : match.white_time_ms,
      black_time_ms: sideToMove === "b" ? 0 : match.black_time_ms,
    }).eq("id", data.matchId);
    return { ok: true };
  });
