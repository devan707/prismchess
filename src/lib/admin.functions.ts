/**
 * Admin/moderator server functions. Every function re-checks the caller's role
 * server-side (don't trust the client) and writes to admin_audit_log via the
 * SECURITY DEFINER `log_admin_action` helper.
 *
 * Role split:
 * - admin     → everything (incl. user-management, role grants, suspensions)
 * - moderator → content moderation only (hide/delete/feature/pin/lock)
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string };

async function assertMod(ctx: Ctx) {
  const { data, error } = await ctx.supabase
    .from("user_roles").select("role").eq("user_id", ctx.userId);
  if (error) throw new Error(error.message);
  const roles = (data ?? []).map((r: any) => r.role as string);
  if (!roles.includes("admin") && !roles.includes("moderator")) {
    throw new Error("Forbidden");
  }
  return { roles, isAdmin: roles.includes("admin") };
}
async function assertAdmin(ctx: Ctx) {
  const r = await assertMod(ctx);
  if (!r.isAdmin) throw new Error("Admin only");
  return r;
}
async function log(ctx: Ctx, action: string, targetType: string, targetId: string | null, details: Record<string, unknown> = {}) {
  await ctx.supabase.rpc("log_admin_action", {
    _action: action,
    _target_type: targetType,
    _target_id: targetId,
    _details: details as never,
  });
}

// ─── Forum ─────────────────────────────────────────────────────────────────
export const adminDeleteForumTopic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ topicId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertMod(context);
    const { error } = await context.supabase.from("forum_topics").delete().eq("id", data.topicId);
    if (error) throw new Error(error.message);
    await log(context, "forum_topic.delete", "forum_topic", data.topicId);
    return { ok: true };
  });

export const adminDeleteForumReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ replyId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertMod(context);
    const { error } = await context.supabase.from("forum_replies").delete().eq("id", data.replyId);
    if (error) throw new Error(error.message);
    await log(context, "forum_reply.delete", "forum_reply", data.replyId);
    return { ok: true };
  });

export const adminSetTopicFlags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      topicId: z.string().uuid(),
      isPinned: z.boolean().optional(),
      isFeatured: z.boolean().optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMod(context);
    const patch: Record<string, unknown> = {};
    if (data.isPinned !== undefined) patch.is_pinned = data.isPinned;
    if (data.isFeatured !== undefined) patch.is_featured = data.isFeatured;
    const { error } = await context.supabase.from("forum_topics").update(patch).eq("id", data.topicId);
    if (error) throw new Error(error.message);
    await log(context, "forum_topic.flags", "forum_topic", data.topicId, patch);
    return { ok: true };
  });

// ─── Game comments ─────────────────────────────────────────────────────────
export const adminDeleteGameComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ commentId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertMod(context);
    const { error } = await context.supabase.from("game_comments").delete().eq("id", data.commentId);
    if (error) throw new Error(error.message);
    await log(context, "game_comment.delete", "game_comment", data.commentId);
    return { ok: true };
  });

// ─── Published games (variant feeds) ───────────────────────────────────────
export const adminSetPublishedGameFlags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      gameId: z.string().uuid(),
      isHidden: z.boolean().optional(),
      isFeatured: z.boolean().optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMod(context);
    const patch: Record<string, unknown> = {};
    if (data.isHidden !== undefined) patch.is_hidden = data.isHidden;
    if (data.isFeatured !== undefined) patch.is_featured = data.isFeatured;
    const { error } = await context.supabase.from("published_games").update(patch).eq("id", data.gameId);
    if (error) throw new Error(error.message);
    await log(context, "published_game.flags", "published_game", data.gameId, patch);
    return { ok: true };
  });

export const adminDeletePublishedGame = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ gameId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertMod(context);
    const { error } = await context.supabase.from("published_games").delete().eq("id", data.gameId);
    if (error) throw new Error(error.message);
    await log(context, "published_game.delete", "published_game", data.gameId);
    return { ok: true };
  });

// ─── Custom pieces ─────────────────────────────────────────────────────────
export const adminSetCustomPieceFlags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      pieceId: z.string().uuid(),
      isHidden: z.boolean().optional(),
      isFeatured: z.boolean().optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMod(context);
    const patch: Record<string, unknown> = {};
    if (data.isHidden !== undefined) patch.is_hidden = data.isHidden;
    if (data.isFeatured !== undefined) patch.is_featured = data.isFeatured;
    const { error } = await context.supabase.from("custom_pieces").update(patch).eq("id", data.pieceId);
    if (error) throw new Error(error.message);
    await log(context, "custom_piece.flags", "custom_piece", data.pieceId, patch);
    return { ok: true };
  });

export const adminDeleteCustomPiece = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ pieceId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertMod(context);
    const { error } = await context.supabase.from("custom_pieces").delete().eq("id", data.pieceId);
    if (error) throw new Error(error.message);
    await log(context, "custom_piece.delete", "custom_piece", data.pieceId);
    return { ok: true };
  });

// ─── Matches ───────────────────────────────────────────────────────────────
export const adminCancelMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ matchId: z.string().uuid(), reason: z.string().max(200).optional() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMod(context);
    const { error } = await context.supabase.from("matches").update({
      status: "finished",
      result: "draw",
      result_reason: data.reason ? `admin_cancel:${data.reason}` : "admin_cancel",
      finished_at: new Date().toISOString(),
    }).eq("id", data.matchId);
    if (error) throw new Error(error.message);
    await log(context, "match.cancel", "match", data.matchId, { reason: data.reason ?? null });
    return { ok: true };
  });

export const adminPurgeStaleChallenges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertMod(context);
    const { data, error } = await context.supabase
      .from("matches").delete()
      .eq("status", "open")
      .lt("expires_at", new Date().toISOString())
      .select("id");
    if (error) throw new Error(error.message);
    const count = data?.length ?? 0;
    await log(context, "matches.purge_stale", "match", null, { count });
    return { count };
  });

// ─── Reports ───────────────────────────────────────────────────────────────
export const adminListReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertMod(context);
    const { data, error } = await context.supabase
      .from("reports")
      .select("id, reporter_id, target_type, target_id, reason, status, handled_by, handled_at, resolution, created_at")
      .order("status", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const adminResolveReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      reportId: z.string().uuid(),
      status: z.enum(["resolved", "dismissed"]),
      resolution: z.string().max(500).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMod(context);
    const { error } = await context.supabase.from("reports").update({
      status: data.status,
      handled_by: context.userId,
      handled_at: new Date().toISOString(),
      resolution: data.resolution ?? null,
    }).eq("id", data.reportId);
    if (error) throw new Error(error.message);
    await log(context, "report.resolve", "report", data.reportId, { status: data.status });
    return { ok: true };
  });

// ─── User management (admin only) ──────────────────────────────────────────
export const adminListUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ q: z.string().max(60).optional() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    let q = context.supabase
      .from("profiles")
      .select("id, username, display_name, created_at, suspended_until")
      .order("created_at", { ascending: false })
      .limit(100);
    if (data.q && data.q.trim()) {
      const term = `%${data.q.trim()}%`;
      q = q.or(`username.ilike.${term},display_name.ilike.${term}`);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const ids = (rows ?? []).map((r: any) => r.id);
    let rolesByUser: Record<string, string[]> = {};
    if (ids.length) {
      const { data: roles } = await context.supabase
        .from("user_roles").select("user_id, role").in("user_id", ids);
      for (const r of roles ?? []) {
        const k = (r as any).user_id as string;
        rolesByUser[k] = rolesByUser[k] ?? [];
        rolesByUser[k].push((r as any).role as string);
      }
    }
    return (rows ?? []).map((r: any) => ({ ...r, roles: rolesByUser[r.id] ?? [] }));
  });

export const adminSetRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      userId: z.string().uuid(),
      role: z.enum(["admin", "moderator"]),
      grant: z.boolean(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.grant) {
      const { error } = await context.supabase.from("user_roles")
        .insert({ user_id: data.userId, role: data.role as never });
      if (error && error.code !== "23505") throw new Error(error.message);
    } else {
      const { error } = await context.supabase.from("user_roles")
        .delete().eq("user_id", data.userId).eq("role", data.role as never);
      if (error) throw new Error(error.message);
    }
    await log(context, data.grant ? "role.grant" : "role.revoke", "user", data.userId, { role: data.role });
    return { ok: true };
  });

export const adminSuspendUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      userId: z.string().uuid(),
      until: z.string().datetime().nullable(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("profiles")
      .update({ suspended_until: data.until }).eq("id", data.userId);
    if (error) throw new Error(error.message);
    await log(context, data.until ? "user.suspend" : "user.unsuspend", "user", data.userId, { until: data.until });
    return { ok: true };
  });

export const adminRenameUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      userId: z.string().uuid(),
      username: z.string().min(3).max(24).regex(/^[a-z0-9_]+$/),
      display_name: z.string().min(1).max(60).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const patch: Record<string, unknown> = { username: data.username };
    if (data.display_name) patch.display_name = data.display_name;
    const { error } = await context.supabase.from("profiles").update(patch).eq("id", data.userId);
    if (error) {
      if (error.code === "23505") throw new Error("Username already taken");
      throw new Error(error.message);
    }
    await log(context, "user.rename", "user", data.userId, patch);
    return { ok: true };
  });

// ─── Audit log viewer ──────────────────────────────────────────────────────
export const adminListAuditLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ limit: z.number().int().min(1).max(200).optional() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertMod(context);
    const { data: rows, error } = await context.supabase
      .from("admin_audit_log")
      .select("id, actor_id, action, target_type, target_id, details, created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 100);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ─── Lightweight analytics ─────────────────────────────────────────────────
export const adminGetStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertMod(context);
    const sb = context.supabase;
    const since7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const [users, signups7, activeMatches, finished7, topVariants, topPieces] = await Promise.all([
      sb.from("profiles").select("*", { count: "exact", head: true }),
      sb.from("profiles").select("*", { count: "exact", head: true }).gte("created_at", since7),
      sb.from("matches").select("*", { count: "exact", head: true }).eq("status", "active"),
      sb.from("matches").select("*", { count: "exact", head: true }).eq("status", "finished").gte("finished_at", since7),
      sb.from("variant_plays").select("variant_key, plays").order("plays", { ascending: false }).limit(10),
      sb.from("custom_pieces").select("id, name, like_count").eq("visibility", "public").order("like_count", { ascending: false }).limit(10),
    ]);
    return {
      users: users.count ?? 0,
      signups7: signups7.count ?? 0,
      activeMatches: activeMatches.count ?? 0,
      finished7: finished7.count ?? 0,
      topVariants: topVariants.data ?? [],
      topPieces: topPieces.data ?? [],
    };
  });
