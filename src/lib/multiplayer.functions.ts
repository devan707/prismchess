import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Design, Move, Color } from "@/game/types";

const THREE_DAY_MS = 3 * 24 * 60 * 60 * 1000;
function budgetMsFor(tc: string): number {
  if (tc === "3day") return THREE_DAY_MS;
  const m = /^(\d+)min$/.exec(tc);
  if (m) return Math.max(1, parseInt(m[1], 10)) * 60 * 1000;
  return 10 * 60 * 1000;
}
function isPerMove(tc: string): boolean {
  return tc === "3day";
}

// Accept either `<N>min` (1–180) or `3day`.
const TimeControl = z.string().regex(/^(\d+min|3day)$/).refine((v) => {
  if (v === "3day") return true;
  const n = parseInt(v, 10);
  return n >= 1 && n <= 180;
}, { message: "Invalid time control" });
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
    const budget = budgetMsFor(data.timeControl);
    // Open challenges auto-expire after 15 min of inactivity so unjoined invites
    // don't pile up if the host closes the tab without cancelling.
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const { data: row, error } = await context.supabase
      .from("matches")
      .insert({
        host_id: context.userId,
        design: data.design as never,
        design_name: data.designName,
        time_control: data.timeControl,
        host_color: data.hostColor,
        visibility: data.visibility,
        rated: data.rated ?? false,
        white_time_ms: budget,
        black_time_ms: budget,
        turn: "w",
        expires_at: expiresAt,
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
      .select("id, host_id, guest_id, status, design_name")
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("matches")
      .update({
        guest_id: context.userId,
        status: "ready_check",
        started_at: now,
        last_clock_update_at: null,
        expires_at: null,
        ready_w: false,
        ready_b: false,
      } as never)
      .eq("id", match.id)
      .eq("status", "open");
    if (error) throw new Error(error.message);

    // Notify the host that their challenge was accepted — they need to tap Ready.
    const { sendPushBackground } = await import("./push.server");
    sendPushBackground(match.host_id, {
      title: "Opponent joined",
      body: `Someone joined your "${match.design_name}" challenge — tap to start.`,
      url: `/multiplayer/${match.id}`,
      tag: `match:${match.id}:joined`,
    });

    return { id: match.id };
  });

// ─── Mark ready (ready-check before clock starts) ──────────────────────────
export const markReady = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ matchId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: match, error } = await context.supabase
      .from("matches")
      .select("host_id, guest_id, host_color, status, ready_w, ready_b, design_name")
      .eq("id", data.matchId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!match) throw new Error("Match not found.");
    if (match.status !== "ready_check") throw new Error("Match is not awaiting ready.");
    if (context.userId !== match.host_id && context.userId !== match.guest_id) {
      throw new Error("Not a player in this match.");
    }
    const meColor: Color =
      context.userId === match.host_id ? (match.host_color as Color)
      : (match.host_color === "w" ? "b" : "w");
    const myFlag = meColor === "w" ? "ready_w" : "ready_b";
    const otherFlag = meColor === "w" ? "ready_b" : "ready_w";
    const otherReady = (match as Record<string, unknown>)[otherFlag] === true;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (otherReady) {
      const startedAt = new Date().toISOString();
      const { error: uErr } = await supabaseAdmin.from("matches").update({
        [myFlag]: true,
        status: "active",
        last_clock_update_at: startedAt,
      } as never).eq("id", data.matchId).eq("status", "ready_check");
      if (uErr) throw new Error(uErr.message);

      const { sendPushBackground } = await import("./push.server");
      const firstMoverId =
        match.host_color === "w" ? match.host_id : match.guest_id;
      const otherId = firstMoverId === match.host_id ? match.guest_id : match.host_id;
      if (firstMoverId) sendPushBackground(firstMoverId, {
        title: "Game on",
        body: `"${match.design_name}" has started — your move.`,
        url: `/multiplayer/${data.matchId}`,
        tag: `match:${data.matchId}:start`,
      });
      if (otherId) sendPushBackground(otherId, {
        title: "Game on",
        body: `"${match.design_name}" has started.`,
        url: `/multiplayer/${data.matchId}`,
        tag: `match:${data.matchId}:start`,
      });
      return { ok: true, started: true };
    } else {
      const { error: uErr } = await supabaseAdmin.from("matches").update({
        [myFlag]: true,
      } as never).eq("id", data.matchId).eq("status", "ready_check");
      if (uErr) throw new Error(uErr.message);

      const otherId = context.userId === match.host_id ? match.guest_id : match.host_id;
      if (otherId) {
        const { sendPushBackground } = await import("./push.server");
        sendPushBackground(otherId, {
          title: "Opponent is ready",
          body: `Tap Ready to start "${match.design_name}".`,
          url: `/multiplayer/${data.matchId}`,
          tag: `match:${data.matchId}:ready`,
        });
      }
      return { ok: true, started: false };
    }
  });

// ─── Public challenge preview (no auth — for share-link landing page) ──────
export const getChallengePreview = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ token: z.string().min(1).max(64) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new Error("Server not configured.");
    const sb = createClient(url, key, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });
    const { data: match, error } = await sb
      .from("matches")
      .select("id, host_id, design_name, time_control, host_color, status")
      .eq("share_token", data.token)
      .maybeSingle();
    if (error || !match) return { match: null as null, host: null };
    const { data: host } = await sb
      .from("profiles")
      .select("username, display_name")
      .eq("id", match.host_id as string)
      .maybeSingle();
    return {
      match: {
        id: match.id as string,
        design_name: match.design_name as string,
        time_control: match.time_control as string,
        host_color: match.host_color as Color,
        status: match.status as string,
      },
      host: host ? { username: host.username as string, display_name: host.display_name as string | null } : null,
    };
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
    const budget = budgetMsFor(match.time_control);
    const perMove = isPerMove(match.time_control);

    const remainingBefore = meColor === "w" ? match.white_time_ms : match.black_time_ms;
    const remainingAfter = Math.max(0, remainingBefore - elapsed);

    if (remainingAfter <= 0 && !perMove) {
      // Timeout — opponent wins.
      const winner: Color = meColor === "w" ? "b" : "w";
      await (await import("@/integrations/supabase/client.server")).supabaseAdmin.from("matches").update({
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
    const { error: uErr } = await (await import("@/integrations/supabase/client.server")).supabaseAdmin.from("matches").update(update as never).eq("id", data.matchId);
    if (uErr) throw new Error(uErr.message);

    const { supabaseAdmin: _sbA1 } = await import("@/integrations/supabase/client.server");
    const { error: iErr } = await _sbA1.from("match_moves").insert({
      match_id: data.matchId,
      ply: data.ply,
      move: data.move as never,
      actor_id: context.userId,
      time_left_ms: moverNewTime,
    } as never);
    if (iErr) throw new Error(iErr.message);

    // Notify the opponent that it's their turn.
    const opponentId =
      context.userId === match.host_id ? match.guest_id : match.host_id;
    if (opponentId) {
      const { sendPushBackground } = await import("./push.server");
      sendPushBackground(opponentId, {
        title: "Your move",
        body: "Your opponent just played — your turn.",
        url: `/multiplayer/${data.matchId}`,
        tag: `match:${data.matchId}:turn`,
      });
    }

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
    const { error: uErr } = await (await import("@/integrations/supabase/client.server")).supabaseAdmin.from("matches").update({
      status: "finished",
      result: winner,
      result_reason: "resign",
      finished_at: new Date().toISOString(),
    }).eq("id", data.matchId);
    if (uErr) throw new Error(uErr.message);
    await (await import("@/integrations/supabase/client.server")).supabaseAdmin.from("match_events").insert({
      match_id: data.matchId,
      kind: "resign",
      actor_id: context.userId,
      payload: {},
    } as never);
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
    const { error: uErr } = await (await import("@/integrations/supabase/client.server")).supabaseAdmin.from("matches").update({
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
    const { data: match, error: mErr } = await context.supabase
      .from("matches")
      .select("host_id, guest_id, status")
      .eq("id", data.matchId)
      .maybeSingle();
    if (mErr) throw new Error(mErr.message);
    if (!match) throw new Error("Match not found.");
    if (match.status !== "active") throw new Error("Match is not active.");
    if (context.userId !== match.host_id && context.userId !== match.guest_id) {
      throw new Error("Not a player in this match.");
    }

    // Check for an existing pending offer (no response or move since it was made).
    const { data: lastOffer } = await context.supabase
      .from("match_events")
      .select("id, actor_id, payload, created_at")
      .eq("match_id", data.matchId)
      .eq("kind", "draw_offer")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastOffer) {
      const { data: lastResp } = await context.supabase
        .from("match_events")
        .select("created_at")
        .eq("match_id", data.matchId)
        .in("kind", ["draw_accept", "draw_decline"])
        .gt("created_at", lastOffer.created_at)
        .limit(1)
        .maybeSingle();
      const offerPly = (lastOffer.payload as { ply?: number } | null)?.ply ?? 0;
      const { count: movesSince } = await context.supabase
        .from("match_moves")
        .select("ply", { count: "exact", head: true })
        .eq("match_id", data.matchId)
        .gte("ply", offerPly);
      const stillPending = !lastResp && (movesSince ?? 0) === 0;
      if (stillPending) {
        if (lastOffer.actor_id === context.userId) {
          throw new Error("You already have a pending draw offer.");
        }
        throw new Error("Your opponent already has a pending draw offer — respond to it instead.");
      }
    }

    const { count: movesCount } = await context.supabase
      .from("match_moves")
      .select("ply", { count: "exact", head: true })
      .eq("match_id", data.matchId);

    const { error } = await (await import("@/integrations/supabase/client.server")).supabaseAdmin.from("match_events").insert({
      match_id: data.matchId,
      kind: "draw_offer",
      actor_id: context.userId,
      payload: { ply: movesCount ?? 0 },
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const respondDraw = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ matchId: z.string().uuid(), accept: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: match, error: mErr } = await context.supabase
      .from("matches")
      .select("host_id, guest_id, status")
      .eq("id", data.matchId)
      .maybeSingle();
    if (mErr) throw new Error(mErr.message);
    if (!match) throw new Error("Match not found.");
    if (match.status !== "active") throw new Error("Match is not active.");
    if (context.userId !== match.host_id && context.userId !== match.guest_id) {
      throw new Error("Not a player in this match.");
    }

    const { data: lastOffer } = await context.supabase
      .from("match_events")
      .select("id, actor_id, payload, created_at")
      .eq("match_id", data.matchId)
      .eq("kind", "draw_offer")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!lastOffer) throw new Error("No draw offer to respond to.");
    if (lastOffer.actor_id === context.userId) {
      throw new Error("You can't respond to your own draw offer.");
    }
    const { data: laterResp } = await context.supabase
      .from("match_events")
      .select("id")
      .eq("match_id", data.matchId)
      .in("kind", ["draw_accept", "draw_decline"])
      .gt("created_at", lastOffer.created_at)
      .limit(1)
      .maybeSingle();
    if (laterResp) throw new Error("That draw offer was already answered.");

    await (await import("@/integrations/supabase/client.server")).supabaseAdmin.from("match_events").insert({
      match_id: data.matchId,
      kind: data.accept ? "draw_accept" : "draw_decline",
      actor_id: context.userId,
      payload: {},
    } as never);
    if (data.accept) {
      await (await import("@/integrations/supabase/client.server")).supabaseAdmin.from("matches").update({
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
    await (await import("@/integrations/supabase/client.server")).supabaseAdmin.from("matches").update({
      status: "finished",
      result: winner,
      result_reason: "timeout",
      finished_at: new Date().toISOString(),
      white_time_ms: sideToMove === "w" ? 0 : match.white_time_ms,
      black_time_ms: sideToMove === "b" ? 0 : match.black_time_ms,
    }).eq("id", data.matchId);
    return { ok: true };
  });

// ─── Rematch: offer ────────────────────────────────────────────────────────
export const offerRematch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ matchId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: match, error } = await context.supabase
      .from("matches")
      .select("host_id, guest_id, status, design_name")
      .eq("id", data.matchId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!match) throw new Error("Match not found.");
    if (match.status !== "finished") throw new Error("Match is not finished.");
    if (context.userId !== match.host_id && context.userId !== match.guest_id) {
      throw new Error("Not a player in this match.");
    }

    // Block if there's already a pending offer / accept / decline from this side.
    const { data: events } = await context.supabase
      .from("match_events")
      .select("id, kind, actor_id, payload, created_at")
      .eq("match_id", data.matchId)
      .in("kind", ["rematch_offer", "rematch_accept", "rematch_decline"])
      .order("created_at", { ascending: false })
      .limit(5);
    const latestAccept = (events ?? []).find((e) => e.kind === "rematch_accept");
    if (latestAccept) {
      const p = latestAccept.payload as { newMatchId?: string } | null;
      return { ok: true, newMatchId: p?.newMatchId ?? null };
    }
    const latestOffer = (events ?? []).find((e) => e.kind === "rematch_offer");
    const latestDecline = (events ?? []).find((e) => e.kind === "rematch_decline");
    const declineNewer = latestDecline && latestOffer && latestDecline.created_at > latestOffer.created_at;
    if (latestOffer && !declineNewer) {
      if (latestOffer.actor_id === context.userId) {
        throw new Error("You already offered a rematch.");
      }
      throw new Error("Your opponent already offered a rematch — respond to it.");
    }

    const { error: iErr } = await (await import("@/integrations/supabase/client.server")).supabaseAdmin.from("match_events").insert({
      match_id: data.matchId,
      kind: "rematch_offer",
      actor_id: context.userId,
      payload: {},
    } as never);
    if (iErr) throw new Error(iErr.message);

    const otherId = context.userId === match.host_id ? match.guest_id : match.host_id;
    if (otherId) {
      const { sendPushBackground } = await import("./push.server");
      sendPushBackground(otherId, {
        title: "Rematch?",
        body: `Your opponent wants a rematch of "${match.design_name}".`,
        url: `/multiplayer/${data.matchId}`,
        tag: `match:${data.matchId}:rematch`,
      });
    }
    return { ok: true, newMatchId: null };
  });

// ─── Rematch: respond ──────────────────────────────────────────────────────
export const respondRematch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ matchId: z.string().uuid(), accept: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: match, error } = await context.supabase
      .from("matches")
      .select("host_id, guest_id, host_color, status, design, design_name, time_control, rated, visibility")
      .eq("id", data.matchId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!match) throw new Error("Match not found.");
    if (match.status !== "finished") throw new Error("Match is not finished.");
    if (context.userId !== match.host_id && context.userId !== match.guest_id) {
      throw new Error("Not a player in this match.");
    }

    const { data: lastOffer } = await context.supabase
      .from("match_events")
      .select("id, actor_id, created_at")
      .eq("match_id", data.matchId)
      .eq("kind", "rematch_offer")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!lastOffer) throw new Error("No rematch offer to respond to.");
    if (lastOffer.actor_id === context.userId) {
      throw new Error("You can't respond to your own rematch offer.");
    }
    const { data: laterResp } = await context.supabase
      .from("match_events")
      .select("id, kind, payload")
      .eq("match_id", data.matchId)
      .in("kind", ["rematch_accept", "rematch_decline"])
      .gt("created_at", lastOffer.created_at)
      .limit(1)
      .maybeSingle();
    if (laterResp) {
      if (laterResp.kind === "rematch_accept") {
        const p = laterResp.payload as { newMatchId?: string } | null;
        return { ok: true, newMatchId: p?.newMatchId ?? null };
      }
      throw new Error("That rematch offer was already answered.");
    }

    if (!data.accept) {
      await context.supabase.from("match_events").insert({
        match_id: data.matchId,
        kind: "rematch_decline",
        actor_id: context.userId,
        payload: {},
      });
      return { ok: true, newMatchId: null };
    }

    // Create the new match: swap colors, same design + time control, immediate ready_check.
    const budget = budgetMsFor(match.time_control as string);
    const newHostColor: Color = (match.host_color as Color) === "w" ? "b" : "w";
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const startedAt = new Date().toISOString();
    const { data: newRow, error: cErr } = await supabaseAdmin
      .from("matches")
      .insert({
        host_id: match.host_id,
        guest_id: match.guest_id,
        design: match.design as never,
        design_name: match.design_name,
        time_control: match.time_control,
        host_color: newHostColor,
        visibility: match.visibility,
        rated: match.rated ?? false,
        white_time_ms: budget,
        black_time_ms: budget,
        turn: "w",
        status: "ready_check",
        started_at: startedAt,
        ready_w: false,
        ready_b: false,
      } as never)
      .select("id")
      .single();
    if (cErr) throw new Error(cErr.message);
    const newMatchId = newRow.id as string;

    await context.supabase.from("match_events").insert({
      match_id: data.matchId,
      kind: "rematch_accept",
      actor_id: context.userId,
      payload: { newMatchId },
    });

    const offererId = lastOffer.actor_id;
    if (offererId) {
      const { sendPushBackground } = await import("./push.server");
      sendPushBackground(offererId, {
        title: "Rematch accepted",
        body: `Your rematch of "${match.design_name}" is starting.`,
        url: `/multiplayer/${newMatchId}`,
        tag: `match:${newMatchId}:start`,
      });
    }
    return { ok: true, newMatchId };
  });
